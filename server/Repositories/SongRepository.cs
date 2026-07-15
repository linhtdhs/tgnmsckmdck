using Microsoft.Data.Sqlite;
using TgnmsckmdckApi.Models;
using TgnmsckmdckApi.Services;
using System.Text;

namespace TgnmsckmdckApi.Repositories;

public class SongRepository : ISongRepository
{
    private readonly IMasterRepository _masterRepo;

    public SongRepository(IMasterRepository masterRepo)
    {
        _masterRepo = masterRepo;
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

    public Song? GetSongByYoutubeId(string youtubeId)
    {
        using var conn = _masterRepo.CreateConnection();
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
        using var conn = _masterRepo.CreateConnection();
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
        using var conn = _masterRepo.CreateConnection();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM songs WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", id);
        cmd.ExecuteNonQuery();
        CleanupUnusedTags(conn);
    }

    public List<Song> GetSongs(string? search = null, List<string>? tags = null, string matchType = "all")
    {
        using var conn = _masterRepo.CreateConnection();
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
