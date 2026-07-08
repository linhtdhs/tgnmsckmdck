import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const binDir = path.join(__dirname, '../../bin');
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

// Determine correct yt-dlp binary name and URL
let binaryName = 'yt-dlp';
let downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

if (process.platform === 'win32') {
  binaryName = 'yt-dlp.exe';
  downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
} else if (process.platform === 'darwin') {
  binaryName = 'yt-dlp_macos';
  downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
}

const binaryPath = path.join(binDir, binaryName);
const ffmpegPath = ffmpegInstaller.path;

/**
 * Ensures yt-dlp is downloaded and executable
 */
export async function ensureYtDlp() {
  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  console.log(`yt-dlp binary not found. Downloading from ${downloadUrl}...`);
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`Failed to download yt-dlp: ${res.status} ${res.statusText}`);
    }
    
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(binaryPath, Buffer.from(arrayBuffer));
    
    if (process.platform !== 'win32') {
      fs.chmodSync(binaryPath, 0o755);
    }
    console.log(`yt-dlp binary downloaded successfully to ${binaryPath}`);
    return binaryPath;
  } catch (error) {
    console.error('Error downloading yt-dlp binary:', error);
    throw error;
  }
}

/**
 * Extracts the YouTube ID from a YouTube link
 */
export function extractYoutubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Gets metadata of a YouTube video without downloading it
 */
export async function getMetadata(url) {
  const ytdlp = await ensureYtDlp();
  
  return new Promise((resolve, reject) => {
    const proc = spawn(ytdlp, ['--dump-json', '--skip-download', url]);
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Failed to get metadata. Code ${code}: ${stderr}`));
      }
      try {
        const info = JSON.parse(stdout);
        resolve({
          youtube_id: info.id,
          title: info.title,
          duration: info.duration, // in seconds
          thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails.length ? info.thumbnails[info.thumbnails.length - 1].url : null)
        });
      } catch (err) {
        reject(new Error(`Failed to parse metadata JSON: ${err.message}`));
      }
    });
  });
}

/**
 * Downloads a video and extracts audio into an MP3 file
 */
export async function downloadAndConvert(url, onProgress) {
  const ytdlp = await ensureYtDlp();
  const mediaDir = path.join(__dirname, '../../data/media');
  
  // Format output template: save as video ID.mp3 in the media folder
  // yt-dlp handles audio extraction and ffmpeg conversion
  const args = [
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '192K',
    '--ffmpeg-location', ffmpegPath,
    '-o', path.join(mediaDir, '%(id)s.%(ext)s'),
    url
  ];

  return new Promise((resolve, reject) => {
    console.log(`Starting download with yt-dlp: ${ytdlp} ${args.join(' ')}`);
    const proc = spawn(ytdlp, args);
    
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      const output = data.toString();
      // Match yt-dlp download progress format: [download]  10.5% of 15.23MiB ...
      const progressMatch = output.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (progressMatch && onProgress) {
        const percent = parseFloat(progressMatch[1]);
        onProgress(percent);
      }
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`yt-dlp exited with error code ${code}: ${stderr}`);
        return reject(new Error(`Download failed. yt-dlp error: ${stderr}`));
      }
      resolve();
    });
  });
}
