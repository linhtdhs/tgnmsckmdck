using TgnmsckmdckApi.Models;

namespace TgnmsckmdckApi.Services;

public record SongDownloadInfo(string FilePath, string ContentType, string DownloadName);

public interface ISongsService
{
    List<Song> GetSongs(string? search, string? tags, string? matchType);
    SongDownloadInfo? GetSongDownloadInfo(int id);
    bool DeleteSong(int id);
    Tag? AddTag(int id, string tagName);
    void RemoveTag(int id, int tagId);
}
