using TgnmsckmdckApi.Services;

var builder = WebApplication.CreateBuilder(args);

// ─── Services ───────────────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddSingleton<DatabaseService>();
builder.Services.AddSingleton<DownloaderService>();

// CORS: allow Angular dev server during development
builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", policy =>
        policy.WithOrigins("http://localhost:4200")
              .AllowAnyHeader()
              .AllowAnyMethod());
});

builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

// ─── Ensure yt-dlp is ready at startup ──────────────────────────────────────
var downloader = app.Services.GetRequiredService<DownloaderService>();
_ = downloader.EnsureYtDlpAsync().ContinueWith(t =>
{
    if (t.IsFaulted)
        app.Logger.LogError(t.Exception, "CRITICAL: Failed to download yt-dlp on startup");
});

// ─── Middleware ──────────────────────────────────────────────────────────────
app.UseCors("DevCors");

// Serve downloaded MP3 files
var db = app.Services.GetRequiredService<DatabaseService>();
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(db.GetMediaDir()),
    RequestPath  = "/audio"
});

// Serve built Angular app (populated by `ng build`)
var angularDist = Path.GetFullPath(
    Path.Combine(AppContext.BaseDirectory, "../../../../../client/dist/tgnmsckmdck-client/browser"));

if (Directory.Exists(angularDist))
{
    app.UseDefaultFiles(new DefaultFilesOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(angularDist),
        RequestPath  = ""
    });
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(angularDist),
        RequestPath  = ""
    });
}

app.UseRouting();
app.MapControllers();

// SPA fallback — return index.html for any unmatched non-API routes
if (Directory.Exists(angularDist))
{
    app.MapFallbackToFile("index.html", new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(angularDist)
    });
}

app.Run();
