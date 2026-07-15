using Microsoft.AspNetCore.Mvc;
using TgnmsckmdckApi.Models;
using TgnmsckmdckApi.Services;

namespace TgnmsckmdckApi.Controllers;

[ApiController]
[Route("api")]
public class DownloadController(
    DatabaseService db,
    DownloaderService downloader,
    ILogger<DownloadController> logger) : ControllerBase
{
    // ─────────────────────────────────────────────────────────────────────
    // POST /api/check-link
    // Body: { "url": "https://..." }
    // Returns: { exists: true, song: Song } | { exists: false, info: VideoInfo }
    // ─────────────────────────────────────────────────────────────────────
    [HttpPost("check-link")]
    public async Task<IActionResult> CheckLink([FromBody] CheckLinkRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Url))
            return BadRequest(new { error = "YouTube URL is required" });

        var youtubeId = DownloaderService.ExtractYoutubeId(body.Url);
        if (youtubeId is null)
            return BadRequest(new { error = "Invalid YouTube URL" });

        var existing = db.GetSongByYoutubeId(youtubeId);
        if (existing is not null)
            return Ok(new { exists = true, song = MapSong(existing) });

        try
        {
            var info = await downloader.GetMetadataAsync(body.Url);
            return Ok(new
            {
                exists = false,
                info = new
                {
                    youtube_id = info.YoutubeId,
                    title      = info.Title,
                    duration   = info.Duration,
                    thumbnail  = info.Thumbnail
                }
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "check-link metadata error");
            return StatusCode(500, new { error = $"Failed to retrieve video metadata: {ex.Message}" });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/download-progress?url=...
    // Server-Sent Events stream
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("download-progress")]
    public async Task DownloadProgress([FromQuery] string url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            Response.StatusCode = 400;
            return;
        }

        var youtubeId = DownloaderService.ExtractYoutubeId(url);
        if (youtubeId is null)
        {
            Response.StatusCode = 400;
            return;
        }

        Response.Headers["Content-Type"]  = "text/event-stream";
        Response.Headers["Cache-Control"] = "no-cache";
        Response.Headers["Connection"]    = "keep-alive";
        Response.Headers["X-Accel-Buffering"] = "no"; // disable Nginx proxy buffering

        async Task SendEvent(string type, object data)
        {
            var json = System.Text.Json.JsonSerializer.Serialize(
                new { type, data },
                new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
            await Response.WriteAsync($"data: {json}\n\n");
            await Response.Body.FlushAsync();
        }

        try
        {
            var existing = db.GetSongByYoutubeId(youtubeId);
            if (existing is not null)
            {
                await SendEvent("complete", MapSong(existing));
                return;
            }

            await SendEvent("status", new { message = "Fetching video metadata..." });
            var info = await downloader.GetMetadataAsync(url);

            await SendEvent("status", new { message = "Downloading and converting audio..." });
            await downloader.DownloadAndConvertAsync(url, async (percent) =>
            {
                await SendEvent("progress", new { percent });
            });

            await SendEvent("status", new { message = "Saving to library..." });
            var filename = $"{youtubeId}.mp3";
            var song = db.InsertSong(youtubeId, info.Title, filename, info.Duration, info.Thumbnail);

            await SendEvent("complete", MapSong(song));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "SSE download error");
            await SendEvent("error", new { message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
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

public record CheckLinkRequest(string Url);
