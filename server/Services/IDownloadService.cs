using TgnmsckmdckApi.Models;

namespace TgnmsckmdckApi.Services;

public record CheckLinkResult(bool Exists, Song? Song = null, object? Info = null);

public interface IDownloadService
{
    Task<CheckLinkResult> CheckLinkAsync(string url);
    Task DownloadProgressAsync(string url, Func<string, object, Task> sendEventAsync);
}
