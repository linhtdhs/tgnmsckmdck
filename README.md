# tgnmsckmdck

> trash but retro audio explorer

A self-hosted personal music library that converts YouTube videos to MP3, organizes them with custom tags, and plays them directly in the browser with a retro pixel-art interface.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | .NET 9 ASP.NET Core Web API |
| Database | SQLite (via `Microsoft.Data.Sqlite`) |
| Frontend | Angular 19 (standalone components, signals) |
| Styling | Vanilla CSS — pixel-art aesthetic (Press Start 2P / VT323 fonts) |
| Media | `yt-dlp` + `ffmpeg` for audio extraction |

---

## Features

- ▶️ Paste a YouTube link → fetch metadata → download + convert to MP3
- 📊 Real-time Server-Sent Events (SSE) progress bar during download
- 🏷️ Custom tagging system — add/remove tags per song
- 🔍 Accent-insensitive search (works with Vietnamese, French, etc.)
- 🎚️ Tag-based filtering with Match All / Match Any modes
- 🎵 Floating retro audio player with scrubber, volume, shuffle, loop
- 📱 Fully mobile-responsive layout

---

## Project Structure

```text
tgensic/
├── server/                   # .NET 9 ASP.NET Core backend
│   ├── Controllers/
│   │   ├── SongsController.cs
│   │   ├── TagsController.cs
│   │   └── DownloadController.cs   # SSE endpoint
│   ├── Services/
│   │   ├── DatabaseService.cs      # SQLite + remove_accents()
│   │   └── DownloaderService.cs    # yt-dlp wrapper
│   ├── Models/
│   │   ├── Song.cs
│   │   └── Tag.cs
│   └── appsettings.json
│
├── client/                   # Angular 19 frontend
│   ├── src/app/
│   │   ├── components/
│   │   │   ├── link-input/         # URL input + SSE progress
│   │   │   ├── song-card/          # Song card with inline tags
│   │   │   ├── tag-sidebar/        # Filter sidebar
│   │   │   ├── floating-player/    # Retro audio player
│   │   │   └── toast/              # Notification stack
│   │   ├── services/
│   │   │   ├── api.service.ts
│   │   │   ├── player.service.ts
│   │   │   └── toast.service.ts
│   │   └── models/
│   │       └── song.model.ts
│   └── proxy.conf.json
│
├── data/
│   ├── db.sqlite             # SQLite database (persisted on disk)
│   └── media/                # Downloaded MP3 files
│
└── bin/
    └── yt-dlp[.exe]          # Auto-downloaded on first run
```

---

## Local Development

### Prerequisites

- [.NET 9 SDK](https://dotnet.microsoft.com/download)
- [Node.js 18+](https://nodejs.org) + [Angular CLI](https://angular.io/cli)
- `ffmpeg` available in PATH (or installed via `@ffmpeg-installer/ffmpeg`)

```bash
npm install -g @angular/cli
```

### Run in development

**Terminal 1 — .NET backend:**
```bash
cd server
dotnet run
# API listening on http://localhost:3001
```

**Terminal 2 — Angular frontend:**
```bash
cd client
ng serve
# Dev server at http://localhost:4200 (proxies /api and /audio to :3001)
```

### Production build

```bash
# 1. Build the Angular app
cd client
ng build

# 2. Run the .NET server (serves the Angular dist automatically)
cd ../server
dotnet run
# Open http://localhost:3001
```

---

## Deployment on GCP Compute Engine

1. **SSH into VM:**
   ```bash
   gcloud compute ssh <instance-name>
   ```

2. **Install .NET 9 runtime:**
   ```bash
   wget https://dot.net/v1/dotnet-install.sh
   bash dotnet-install.sh --channel 9.0
   echo 'export PATH="$HOME/.dotnet:$PATH"' >> ~/.bashrc && source ~/.bashrc
   ```

3. **Install Node.js + Angular CLI:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   npm install -g @angular/cli
   ```

4. **Clone and build:**
   ```bash
   git clone <your-repo-url> tgensic
   cd tgensic/client && ng build
   cd ../server && dotnet publish -c Release -o /opt/tgnmsckmdck
   ```

5. **Create a systemd service:**
   ```ini
   # /etc/systemd/system/tgnmsckmdck.service
   [Unit]
   Description=tgnmsckmdck API
   After=network.target

   [Service]
   WorkingDirectory=/opt/tgnmsckmdck
   ExecStart=/root/.dotnet/dotnet /opt/tgnmsckmdck/TgnmsckmdckApi.dll
   Restart=always
   Environment=ASPNETCORE_URLS=http://0.0.0.0:3001

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable tgnmsckmdck
   sudo systemctl start tgnmsckmdck
   ```

6. **Open firewall port 3001** in the GCP Console → VPC Network → Firewall.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/check-link` | Validate YouTube URL, return metadata or existing song |
| `GET`  | `/api/download-progress?url=...` | SSE stream: progress → complete |
| `GET`  | `/api/songs?search=&tags=&matchType=` | List library with filters |
| `GET`  | `/api/songs/{id}/download` | Download MP3 file |
| `DELETE` | `/api/songs/{id}` | Delete song from library + disk |
| `POST` | `/api/songs/{id}/tags` | Add tag to song |
| `DELETE` | `/api/songs/{id}/tags/{tagId}` | Remove tag from song |
| `GET`  | `/api/tags` | List all tags |
| `GET`  | `/audio/{filename}` | Stream audio file |

---

## Data Persistence

- `data/db.sqlite` — all songs and tags are stored here. **Do not delete.**
- `data/media/*.mp3` — downloaded audio files. **Do not delete.**
- `bin/yt-dlp[.exe]` — automatically downloaded on first startup if missing.
