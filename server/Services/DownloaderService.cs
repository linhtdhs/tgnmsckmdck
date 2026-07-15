using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace TgnmsckmdckApi.Services;

public record VideoInfo(string YoutubeId, string Title, int Duration, string? Thumbnail);

public class DownloaderService
{
    private readonly string _binDir;
    private readonly string _mediaDir;
    private readonly ILogger<DownloaderService> _logger;

    private static readonly string BinaryName = OperatingSystem.IsWindows() ? "yt-dlp.exe"
                                               : OperatingSystem.IsMacOS()  ? "yt-dlp_macos"
                                               : "yt-dlp";

    private static readonly string DownloadUrl = OperatingSystem.IsWindows()
        ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
        : OperatingSystem.IsMacOS()
        ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
        : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

    private readonly string _binaryPath;

    public DownloaderService(IConfiguration config, ILogger<DownloaderService> logger)
    {
        _logger = logger;
        var baseDir = AppContext.BaseDirectory;
        _binDir = Path.GetFullPath(Path.Combine(baseDir, "../../../../../bin"));
        _mediaDir = Path.GetFullPath(Path.Combine(baseDir, "../../../../../data/media"));
        Directory.CreateDirectory(_binDir);
        Directory.CreateDirectory(_mediaDir);
        _binaryPath = Path.Combine(_binDir, BinaryName);
    }

    public async Task EnsureYtDlpAsync()
    {
        if (File.Exists(_binaryPath)) return;

        _logger.LogInformation("yt-dlp not found. Downloading from {Url}...", DownloadUrl);
        using var http = new HttpClient();
        var bytes = await http.GetByteArrayAsync(DownloadUrl);
        await File.WriteAllBytesAsync(_binaryPath, bytes);

        if (!OperatingSystem.IsWindows())
        {
            // chmod +x
            Process.Start("chmod", $"+x {_binaryPath}")?.WaitForExit();
        }
        _logger.LogInformation("yt-dlp downloaded to {Path}", _binaryPath);
    }

    public static string? ExtractYoutubeId(string url)
    {
        var match = Regex.Match(url,
            @"(?:youtu\.be/|v/|u/\w/|embed/|watch\?v=|&v=)([^#&?]{11})");
        return match.Success ? match.Groups[1].Value : null;
    }

    public async Task<VideoInfo> GetMetadataAsync(string url)
    {
        await EnsureYtDlpAsync();
        var (stdout, stderr, code) = await RunProcessAsync(_binaryPath,
            [
                "--dump-json", 
                "--skip-download", 
                "--force-ipv4", 
                "--extractor-args", "youtube:player_client=android,web", 
                url
            ]).ConfigureAwait(false);

        if (code != 0)
            throw new Exception($"yt-dlp metadata failed (code {code}): {stderr}");

        using var doc = JsonDocument.Parse(stdout);
        var root = doc.RootElement;
        var id       = root.GetProperty("id").GetString() ?? "";
        var title    = root.GetProperty("title").GetString() ?? "";
        var duration = root.TryGetProperty("duration", out var dur) ? dur.GetInt32() : 0;
        string? thumbnail = null;
        if (root.TryGetProperty("thumbnail", out var th))
            thumbnail = th.GetString();
        else if (root.TryGetProperty("thumbnails", out var ths) && ths.GetArrayLength() > 0)
            thumbnail = ths[ths.GetArrayLength() - 1].GetProperty("url").GetString();

        return new VideoInfo(id, title, duration, thumbnail);
    }

    public async Task DownloadAndConvertAsync(string url, Action<double> onProgress)
    {
        await EnsureYtDlpAsync();

        var outputTemplate = Path.Combine(_mediaDir, "%(id)s.%(ext)s");
        var args = new[]
        {
            "-x",
            "--audio-format", "mp3",
            "--audio-quality", "192K",
            "--force-ipv4",
            "--extractor-args", "youtube:player_client=android,web",
            "-o", outputTemplate,
            url
        };

        _logger.LogInformation("Starting yt-dlp: {Binary} {Args}", _binaryPath, string.Join(" ", args));

        var tcs = new TaskCompletionSource<bool>();
        var psi = new ProcessStartInfo(_binaryPath)
        {
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute        = false,
            CreateNoWindow         = true,
        };
        foreach (var a in args) psi.ArgumentList.Add(a);

        var proc = new Process { StartInfo = psi, EnableRaisingEvents = true };
        var stderr = new System.Text.StringBuilder();

        proc.OutputDataReceived += (_, e) =>
        {
            if (e.Data is null) return;
            var m = Regex.Match(e.Data, @"\[download\]\s+(\d+(?:\.\d+)?)%");
            if (m.Success)
                onProgress(double.Parse(m.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture));
        };

        proc.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is not null) stderr.AppendLine(e.Data);
        };

        proc.Exited += (_, _) =>
        {
            _logger.LogInformation("yt-dlp exited with code {Code}", proc.ExitCode);
            if (proc.ExitCode == 0) tcs.TrySetResult(true);
            else tcs.TrySetException(new Exception($"yt-dlp failed (code {proc.ExitCode}): {stderr}"));
            proc.Dispose();
        };

        proc.Start();
        proc.BeginOutputReadLine();
        proc.BeginErrorReadLine();

        await tcs.Task;
    }

    // -------------------------------------------------------------------------

    private static async Task<(string stdout, string stderr, int code)> RunProcessAsync(
        string binary, string[] args)
    {
        var psi = new ProcessStartInfo(binary)
        {
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute        = false,
            CreateNoWindow         = true,
        };
        foreach (var a in args) psi.ArgumentList.Add(a);

        using var proc = Process.Start(psi)!;
        var stdout = await proc.StandardOutput.ReadToEndAsync();
        var stderr = await proc.StandardError.ReadToEndAsync();
        await proc.WaitForExitAsync();
        return (stdout, stderr, proc.ExitCode);
    }
}
