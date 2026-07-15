using TgnmsckmdckApi.Models;

namespace TgnmsckmdckApi.Repositories;

public interface ISongRepository
{
    Song? GetSongByYoutubeId(string youtubeId);
    Song InsertSong(string youtubeId, string title, string filename, int duration, string? thumbnail);
    void DeleteSong(int id);
    List<Song> GetSongs(string? search = null, List<string>? tags = null, string matchType = "all");
    Song? GetSongById(int id);
}
