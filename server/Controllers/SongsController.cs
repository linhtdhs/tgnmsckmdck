using Microsoft.AspNetCore.Mvc;
using TgnmsckmdckApi.Models;
using TgnmsckmdckApi.Services;

namespace TgnmsckmdckApi.Controllers;

[ApiController]
[Route("api/songs")]
public class SongsController(ISongsService songsService, ILogger<SongsController> logger) : ControllerBase
{
    // GET /api/songs?search=&tags=pop,rock&matchType=all
    [HttpGet]
    public IActionResult GetSongs([FromQuery] string? search,
                                   [FromQuery] string? tags,
                                   [FromQuery] string? matchType)
    {
        try
        {
            var songs = songsService.GetSongs(search, tags, matchType);
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
        var info = songsService.GetSongDownloadInfo(id);
        if (info is null) return NotFound(new { error = "Song or file not found" });

        return PhysicalFile(info.FilePath, info.ContentType, info.DownloadName);
    }

    // DELETE /api/songs/{id}
    [HttpDelete("{id:int}")]
    public IActionResult DeleteSong(int id)
    {
        var success = songsService.DeleteSong(id);
        if (!success) return NotFound(new { error = "Song not found" });

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
            var tag = songsService.AddTag(id, body.Tag);
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
            songsService.RemoveTag(id, tagId);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "RemoveTag error");
            return StatusCode(500, new { error = "Failed to remove tag" });
        }
    }

    public static object MapSong(Song s) => new
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
