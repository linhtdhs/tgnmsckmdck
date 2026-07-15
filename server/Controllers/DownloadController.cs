using Microsoft.AspNetCore.Mvc;
using TgnmsckmdckApi.Services;

namespace TgnmsckmdckApi.Controllers;

[ApiController]
[Route("api")]
public class DownloadController(IDownloadService downloadService, ILogger<DownloadController> logger) : ControllerBase
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

        try
        {
            var result = await downloadService.CheckLinkAsync(body.Url);
            if (result.Exists)
            {
                return Ok(new { exists = true, song = SongsController.MapSong(result.Song!) });
            }

            return Ok(new
            {
                exists = false,
                info = result.Info
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
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

        Response.Headers["Content-Type"]  = "text/event-stream";
        Response.Headers["Cache-Control"] = "no-cache";
        Response.Headers["Connection"]    = "keep-alive";
        Response.Headers["X-Accel-Buffering"] = "no"; // disable Nginx proxy buffering

        async Task SendEventAsync(string type, object data)
        {
            if (type == "complete" && data is TgnmsckmdckApi.Models.Song s)
            {
                data = SongsController.MapSong(s);
            }
            
            var json = System.Text.Json.JsonSerializer.Serialize(
                new { type, data },
                new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
            await Response.WriteAsync($"data: {json}\n\n");
            await Response.Body.FlushAsync();
        }

        try
        {
            await downloadService.DownloadProgressAsync(url, SendEventAsync);
        }
        catch (ArgumentException)
        {
            Response.StatusCode = 400;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "SSE download error");
            await SendEventAsync("error", new { message = ex.Message });
        }
    }
}

public record CheckLinkRequest(string Url);
