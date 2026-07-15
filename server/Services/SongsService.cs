using TgnmsckmdckApi.Models;
using TgnmsckmdckApi.Repositories;

namespace TgnmsckmdckApi.Services;

public class SongsService : ISongsService
{
    private readonly ISongRepository _songRepo;
    private readonly ITagRepository _tagRepo;
    private readonly IMasterRepository _masterRepo;

    public SongsService(ISongRepository songRepo, ITagRepository tagRepo, IMasterRepository masterRepo)
    {
        _songRepo = songRepo;
        _tagRepo = tagRepo;
        _masterRepo = masterRepo;
    }

    public List<Song> GetSongs(string? search, string? tags, string? matchType)
    {
        var tagList = string.IsNullOrEmpty(tags)
            ? []
            : tags.Split(',').Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()).ToList();

        return _songRepo.GetSongs(search, tagList, matchType ?? "all");
    }

    public SongDownloadInfo? GetSongDownloadInfo(int id)
    {
        var song = _songRepo.GetSongById(id);
        if (song is null) return null;

        var filePath = Path.Combine(_masterRepo.GetMediaDir(), song.Filename);
        if (!System.IO.File.Exists(filePath)) return null;

        var sanitizedTitle = string.Concat(song.Title.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
        return new SongDownloadInfo(filePath, "audio/mpeg", $"{sanitizedTitle}.mp3");
    }

    public bool DeleteSong(int id)
    {
        var song = _songRepo.GetSongById(id);
        if (song is null) return false;

        var filePath = Path.Combine(_masterRepo.GetMediaDir(), song.Filename);
        if (System.IO.File.Exists(filePath))
            System.IO.File.Delete(filePath);

        _songRepo.DeleteSong(id);
        return true;
    }

    public Tag? AddTag(int id, string tagName)
    {
        return _tagRepo.AddTagToSong(id, tagName);
    }

    public void RemoveTag(int id, int tagId)
    {
        _tagRepo.RemoveTagFromSong(id, tagId);
    }
}
