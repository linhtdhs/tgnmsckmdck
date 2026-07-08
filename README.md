# tgnmsckmdck 📼

A lightweight, self-hosted web application that allows you to paste YouTube links, converts them to MP3, index them locally, and organize your music library using custom tags. It features a retro 8-bit pixel art UI, a custom retro media player, and accent-insensitive search.

---

## Key Features

- **8-Bit Pixel Art Design**: Blocky windows, rigid layout, pixelated image rendering, custom scrollbars, and a CRT dark aesthetic with vibrant neon accents.
- **YouTube to MP3 Converter**: Paste a link to validate and download. It handles conversion automatically using `yt-dlp` and `ffmpeg` in the background.
- **Local Audio Library**: Serves and indexes your tracks locally with SQLite.
- **Accent-Insensitive Search**: Search by song name or tag name with unicode normalization. Typing `nhac` will match `nhạc`, and searching `pop` will match `pôp`.
- **Dynamic Tag Filter**: Organize and filter your catalog by multiple tags (supporting intersection "Match All" or union "Match Any" filters).
- **Retro Music Player Dialog**: 
  - Complete media controls (Play/Pause, Prev/Next, Shuffle, Loop, Mute, Volume, Timeline Scrubber).
  - Floating 8-bit styled window layout.
  - Close button `[X]` located at the top-right of the window header.
  - Live animated equalizer visualizer on the progress timeline bar that pulses to the music.

---

## Tech Stack

- **Frontend**: React (Vite) + Lucide Icons + Custom CSS.
- **Backend**: Node.js, Express, Server-Sent Events (SSE) for download progress.
- **Database**: SQLite (via Node's native `node:sqlite`).
- **Downloader**: `yt-dlp` binary with custom Windows spawn wrappers to prevent child process hangs.

---

## Project Structure

```text
├── client/          # React frontend (Vite)
├── server/          # Express backend API and download manager
├── bin/             # Local yt-dlp binary directory
├── data/            # Local SQLite database (db.sqlite) and downloaded media
└── package.json     # Monorepo/Root dependencies & scripts
```

---

## Setup & Run

### Prerequisites
- [Node.js](https://nodejs.org/) (Version 22.x+ recommended for native `node:sqlite` DatabaseSync support).
- A local copy of this repository.

### Install Dependencies
From the root directory, run:
```bash
npm run install:all
```
*(Or manually run `npm install` inside `/client` and `/server` directories)*

### Run in Development
Start both the React client dev server and the Express backend server concurrently from the root directory:
```bash
npm run dev
```

The application will run locally at:
- **Client (Frontend)**: `http://localhost:5173`
- **Server (Backend API)**: `http://localhost:3001`

---

## License

MIT License. Feel free to host and customize your local music catalog!
