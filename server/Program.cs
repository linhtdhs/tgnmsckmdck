using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using TgnmsckmdckApi.Services;
using TgnmsckmdckApi.Repositories;

var builder = WebApplication.CreateBuilder(args);

// ─── Services ───────────────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddSingleton<IMasterRepository, MasterRepository>();
builder.Services.AddSingleton<ISongRepository, SongRepository>();
builder.Services.AddSingleton<ITagRepository, TagRepository>();
builder.Services.AddSingleton<ISongsService, SongsService>();
builder.Services.AddSingleton<ITagsService, TagsService>();
builder.Services.AddSingleton<IDownloadService, DownloadService>();

// ─── Rate Limiting ─────────────────────────────────────────────────────────
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("ApiPolicy", opt =>
    {
        opt.PermitLimit = 10;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 5;
    });
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});

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


// ─── Middleware ──────────────────────────────────────────────────────────────
app.UseCors("DevCors");

// Serve downloaded MP3 files
var db = app.Services.GetRequiredService<IMasterRepository>();
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
app.UseRateLimiter();
app.MapControllers().RequireRateLimiting("ApiPolicy");

// SPA fallback — return index.html for any unmatched non-API routes
if (Directory.Exists(angularDist))
{
    app.MapFallbackToFile("index.html", new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(angularDist)
    });
}

app.Run();
