using Microsoft.Data.Sqlite;
using System.Text;
namespace TgnmsckmdckApi.Repositories;

public class MasterRepository : IMasterRepository
{
    private readonly string _dbPath;
    private readonly string _dataDir;
    private readonly string _mediaDir;

    public MasterRepository(IConfiguration config)
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

    public SqliteConnection CreateConnection()
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

    public string GetMediaDir() => _mediaDir;
}