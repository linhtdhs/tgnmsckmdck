using Microsoft.Data.Sqlite;
using TgnmsckmdckApi.Models;
using TgnmsckmdckApi.Services;

namespace TgnmsckmdckApi.Repositories;

public class TagRepository : ITagRepository
{
    private readonly IMasterRepository _masterRepo;

    public TagRepository(IMasterRepository masterRepo)
    {
        _masterRepo = masterRepo;
    }

    public List<Tag> GetTags()
    {
        using var conn = _masterRepo.CreateConnection();
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

        using var conn = _masterRepo.CreateConnection();

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
        using var conn = _masterRepo.CreateConnection();

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
}
