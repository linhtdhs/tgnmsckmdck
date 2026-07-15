using Microsoft.AspNetCore.Mvc;
using TgnmsckmdckApi.Models;
using TgnmsckmdckApi.Services;

namespace TgnmsckmdckApi.Controllers;

[ApiController]
[Route("api/songs")]
public class SongsController(DatabaseService db, ILogger<SongsController> logger) : ControllerBase
{
    // GET /api/songs?search=&tags=pop,rock&matchType=all
    [HttpGet]
    public IActionResult GetSongs([FromQuery] string? search,
                                   [FromQuery] string? tags,
                                   [FromQuery] string? matchType)
    {
        var tagList = string.IsNullOrEmpty(tags)
            ? []
            : tags.Split(',').Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()).ToList();

        try
        {
            var songs = db.GetSongs(search, tagList, matchType ?? "all");
            return Ok(songs.Select(MapSong));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "GetSongs error");
            return StatusCode(500, new { error = "Failed to retrieve songs" });
        }
    }

    // GET /api/songs/{id}/download
    [HttpGet("{id:int}/download")]
    public IActionResult DownloadMp3(int id)
    {
        var song = db.GetSongById(id);
        if (song is null) return NotFound(new { error = "Song not found" });

        var filePath = Path.Combine(db.GetMediaDir(), song.Filename);
        if (!System.IO.File.Exists(filePath)) return NotFound(new { error = "MP3 file not found on disk" });

        var sanitizedTitle = string.Concat(song.Title.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
        return PhysicalFile(filePath, "audio/mpeg", $"{sanitizedTitle}.mp3");
    }

    // DELETE /api/songs/{id}
    [HttpDelete("{id:int}")]
    public IActionResult DeleteSong(int id)
    {
        var song = db.GetSongById(id);
        if (song is null) return NotFound(new { error = "Song not found" });

        var filePath = Path.Combine(db.GetMediaDir(), song.Filename);
        if (System.IO.File.Exists(filePath))
            System.IO.File.Delete(filePath);

        db.DeleteSong(id);
        return Ok(new { success = true });
    }

    // POST /api/songs/{id}/tags
    [HttpPost("{id:int}/tags")]
    public IActionResult AddTag(int id, [FromBody] AddTagRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Tag))
            return BadRequest(new { error = "Tag name is required" });

        try
        {
            var tag = db.AddTagToSong(id, body.Tag);
            if (tag is null) return StatusCode(500, new { error = "Failed to associate tag" });
            return Ok(new { id = tag.Id, name = tag.Name });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "AddTag error");
            return StatusCode(500, new { error = "Failed to add tag" });
        }
    }

    // DELETE /api/songs/{id}/tags/{tagId}
    [HttpDelete("{id:int}/tags/{tagId:int}")]
    public IActionResult RemoveTag(int id, int tagId)
    {
        try
        {
            db.RemoveTagFromSong(id, tagId);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "RemoveTag error");
            return StatusCode(500, new { error = "Failed to remove tag" });
        }
    }

    private static object MapSong(Song s) => new
    {
        id         = s.Id,
        youtube_id = s.YoutubeId,
        title      = s.Title,
        filename   = s.Filename,
        duration   = s.Duration,
        thumbnail  = s.Thumbnail,
        created_at = s.CreatedAt,
        tags       = s.Tags.Select(t => new { id = t.Id, name = t.Name })
    };
}

public record AddTagRequest(string Tag);
