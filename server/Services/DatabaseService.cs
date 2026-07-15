using Microsoft.Data.Sqlite;
using TgnmsckmdckApi.Models;
using System.Text;

namespace TgnmsckmdckApi.Services;

public class DatabaseService
{
    private readonly string _dbPath;
    private readonly string _dataDir;
    private readonly string _mediaDir;

    public DatabaseService(IConfiguration config)
    {
        // Resolve data directory relative to the executable
        var baseDir = AppContext.BaseDirectory;
        _dataDir = Path.GetFullPath(Path.Combine(baseDir, "../../../../../data"));
        _mediaDir = Path.Combine(_dataDir, "media");

        Directory.CreateDirectory(_dataDir);
        Directory.CreateDirectory(_mediaDir);

        _dbPath = Path.Combine(_dataDir, "db.sqlite");
        InitializeSchema();
    }

    private SqliteConnection CreateConnection()
    {
        var conn = new SqliteConnection($"Data Source={_dbPath}");
        conn.Open();

        // Register the accent-removal function so SQLite queries can call remove_accents()
        conn.CreateFunction("remove_accents", (string? str) =>
        {
            if (str is null) return "";
            var normalized = str.Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder();
            foreach (var c in normalized)
            {
                var cat = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c);
                if (cat != System.Globalization.UnicodeCategory.NonSpacingMark)
                    sb.Append(c);
            }
            return sb.ToString()
                     .Replace('đ', 'd')
                     .Replace('Đ', 'D')
                     .ToLowerInvariant();
        });

        return conn;
    }

    private void InitializeSchema()
    {
        using var conn = CreateConnection();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                youtube_id TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                duration INTEGER NOT NULL,
                thumbnail TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS song_tags (
                song_id INTEGER,
                tag_id INTEGER,
                PRIMARY KEY (song_id, tag_id),
                FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );";
        cmd.ExecuteNonQuery();
    }

    private Song MapRow(SqliteDataReader reader, string? tagsString, string? tagIdsString)
    {
        var tags = new List<Tag>();
        if (!string.IsNullOrEmpty(tagsString) && !string.IsNullOrEmpty(tagIdsString))
        {
            var names = tagsString.Split(',');
            var ids = tagIdsString.Split(',');
            for (int i = 0; i < names.Length; i++)
                tags.Add(new Tag { Id = int.Parse(ids[i]), Name = names[i] });
        }

        return new Song
        {
            Id = reader.GetInt32(0),
            YoutubeId = reader.GetString(1),
            Title = reader.GetString(2),
            Filename = reader.GetString(3),
            Duration = reader.GetInt32(4),
            Thumbnail = reader.IsDBNull(5) ? null : reader.GetString(5),
            CreatedAt = reader.IsDBNull(6) ? DateTime.UtcNow : DateTime.Parse(reader.GetString(6)),
            Tags = tags
        };
    }

    // -------------------------------------------------------------------------
    // SONGS
    // -------------------------------------------------------------------------

    public Song? GetSongByYoutubeId(string youtubeId)
    {
        using var conn = CreateConnection();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT s.id, s.youtube_id, s.title, s.filename, s.duration, s.thumbnail, s.created_at,
                   GROUP_CONCAT(t.name) AS tags_string,
                   GROUP_CONCAT(t.id)   AS tag_ids_string
            FROM songs s
            LEFT JOIN song_tags st ON s.id = st.song_id
            LEFT JOIN tags t ON st.tag_id = t.id
            WHERE s.youtube_id = @youtubeId
            GROUP BY s.id";
        cmd.Parameters.AddWithValue("@youtubeId", youtubeId);

        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;
        return MapRow(reader,
            reader.IsDBNull(7) ? null : reader.GetString(7),
            reader.IsDBNull(8) ? null : reader.GetString(8));
    }

    public Song InsertSong(string youtubeId, string title, string filename, int duration, string? thumbnail)
    {
        using var conn = CreateConnection();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO songs (youtube_id, title, filename, duration, thumbnail)
            VALUES (@youtubeId, @title, @filename, @duration, @thumbnail);
            SELECT last_insert_rowid();";
        cmd.Parameters.AddWithValue("@youtubeId", youtubeId);
        cmd.Parameters.AddWithValue("@title", title);
        cmd.Parameters.AddWithValue("@filename", filename);
        cmd.Parameters.AddWithValue("@duration", duration);
        cmd.Parameters.AddWithValue("@thumbnail", thumbnail ?? (object)DBNull.Value);

        var id = Convert.ToInt32(cmd.ExecuteScalar());
        return new Song { Id = id, YoutubeId = youtubeId, Title = title, Filename = filename, Duration = duration, Thumbnail = thumbnail, Tags = [] };
    }

    public void DeleteSong(int id)
    {
        using var conn = CreateConnection();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM songs WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", id);
        cmd.ExecuteNonQuery();
        CleanupUnusedTags(conn);
    }

    public List<Song> GetSongs(string? search = null, List<string>? tags = null, string matchType = "all")
    {
        using var conn = CreateConnection();
        using var cmd = conn.CreateCommand();

        var filterSql = new StringBuilder();

        if (tags != null && tags.Count > 0)
        {
            var placeholders = string.Join(",", tags.Select((_, i) => $"@tag{i}"));
            for (int i = 0; i < tags.Count; i++)
                cmd.Parameters.AddWithValue($"@tag{i}", tags[i].Trim().ToLower());

            if (matchType == "all")
            {
                cmd.Parameters.AddWithValue("@tagCount", tags.Count);
                filterSql.Append($@"
                    AND s.id IN (
                        SELECT st.song_id FROM song_tags st
                        JOIN tags t ON st.tag_id = t.id
                        WHERE t.name IN ({placeholders})
                        GROUP BY st.song_id
                        HAVING COUNT(DISTINCT t.id) = @tagCount
                    )");
            }
            else
            {
                filterSql.Append($@"
                    AND s.id IN (
                        SELECT DISTINCT st.song_id FROM song_tags st
                        JOIN tags t ON st.tag_id = t.id
                        WHERE t.name IN ({placeholders})
                    )");
            }
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var cleanedSearch = RemoveAccents(search.Trim());
            var searchVal = $"%{cleanedSearch}%";
            cmd.Parameters.AddWithValue("@search", searchVal);
            filterSql.Append(@"
                AND (
                    remove_accents(s.title) LIKE @search
                    OR s.id IN (
                        SELECT st.song_id FROM song_tags st
                        JOIN tags t ON st.tag_id = t.id
                        WHERE remove_accents(t.name) LIKE @search
                    )
                )");
        }

        cmd.CommandText = $@"
            SELECT s.id, s.youtube_id, s.title, s.filename, s.duration, s.thumbnail, s.created_at,
                   GROUP_CONCAT(t.name) AS tags_string,
                   GROUP_CONCAT(t.id)   AS tag_ids_string
            FROM songs s
            LEFT JOIN song_tags st ON s.id = st.song_id
            LEFT JOIN tags t ON st.tag_id = t.id
            WHERE 1=1 {filterSql}
            GROUP BY s.id
            ORDER BY s.created_at DESC";

        var result = new List<Song>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            result.Add(MapRow(reader,
                reader.IsDBNull(7) ? null : reader.GetString(7),
                reader.IsDBNull(8) ? null : reader.GetString(8)));
        return result;
    }

    public Song? GetSongById(int id)
        => GetSongs().FirstOrDefault(s => s.Id == id);

    public string GetMediaDir() => _mediaDir;

    // -------------------------------------------------------------------------
    // TAGS
    // -------------------------------------------------------------------------

    public List<Tag> GetTags()
    {
        using var conn = CreateConnection();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT id, name FROM tags ORDER BY name ASC";
        var result = new List<Tag>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            result.Add(new Tag { Id = reader.GetInt32(0), Name = reader.GetString(1) });
        return result;
    }

    public Tag? AddTagToSong(int songId, string tagName)
    {
        var clean = tagName.Trim().ToLower();
        if (string.IsNullOrEmpty(clean)) return null;

        using var conn = CreateConnection();

        using (var insertTag = conn.CreateCommand())
        {
            insertTag.CommandText = "INSERT OR IGNORE INTO tags (name) VALUES (@name)";
            insertTag.Parameters.AddWithValue("@name", clean);
            insertTag.ExecuteNonQuery();
        }

        int tagId;
        using (var getTag = conn.CreateCommand())
        {
            getTag.CommandText = "SELECT id FROM tags WHERE name = @name";
            getTag.Parameters.AddWithValue("@name", clean);
            tagId = Convert.ToInt32(getTag.ExecuteScalar());
        }

        using (var link = conn.CreateCommand())
        {
            link.CommandText = "INSERT OR IGNORE INTO song_tags (song_id, tag_id) VALUES (@songId, @tagId)";
            link.Parameters.AddWithValue("@songId", songId);
            link.Parameters.AddWithValue("@tagId", tagId);
            link.ExecuteNonQuery();
        }

        return new Tag { Id = tagId, Name = clean };
    }

    public void RemoveTagFromSong(int songId, int tagId)
    {
        using var conn = CreateConnection();

        using (var del = conn.CreateCommand())
        {
            del.CommandText = "DELETE FROM song_tags WHERE song_id = @songId AND tag_id = @tagId";
            del.Parameters.AddWithValue("@songId", songId);
            del.Parameters.AddWithValue("@tagId", tagId);
            del.ExecuteNonQuery();
        }

        using (var cleanup = conn.CreateCommand())
        {
            cleanup.CommandText = "DELETE FROM tags WHERE id = @tagId AND id NOT IN (SELECT DISTINCT tag_id FROM song_tags)";
            cleanup.Parameters.AddWithValue("@tagId", tagId);
            cleanup.ExecuteNonQuery();
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private void CleanupUnusedTags(SqliteConnection conn)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM song_tags)";
        cmd.ExecuteNonQuery();
    }

    private static string RemoveAccents(string str)
    {
        var normalized = str.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in normalized)
        {
            var cat = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c);
            if (cat != System.Globalization.UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        }
        return sb.ToString().Replace('đ', 'd').Replace('Đ', 'D').ToLowerInvariant();
    }
}
