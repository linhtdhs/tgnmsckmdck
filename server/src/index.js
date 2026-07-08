import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { 
  getSongByYoutubeId, 
  insertSong, 
  deleteSong, 
  getSongs, 
  getTags, 
  addTagToSong, 
  removeTagFromSong 
} from './db.js';
import { 
  extractYoutubeId, 
  getMetadata, 
  downloadAndConvert,
  ensureYtDlp
} from './downloader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Ensure the local yt-dlp binary is present on startup
ensureYtDlp().catch(err => {
  console.error('CRITICAL: Failed to download yt-dlp on startup:', err.message);
});

// Serve audio files statically (express.static supports HTTP Range Requests out of the box)
const mediaDir = path.join(__dirname, '../../data/media');
app.use('/audio', express.static(mediaDir));

/**
 * Check if a YouTube URL is already in the library.
 * If yes, return the song entry.
 * If no, fetch and return the video metadata.
 */
app.post('/api/check-link', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'YouTube URL is required' });
  }

  const youtubeId = extractYoutubeId(url);
  if (!youtubeId) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  try {
    const existingSong = getSongByYoutubeId(youtubeId);
    if (existingSong) {
      return res.json({ exists: true, song: existingSong });
    }

    // Fetch video details
    const info = await getMetadata(url);
    res.json({ exists: false, info });
  } catch (error) {
    console.error('Check link error:', error);
    res.status(500).json({ error: `Failed to retrieve video metadata: ${error.message}` });
  }
});

/**
 * SSE endpoint to download and convert the YouTube video, streaming progress in real-time.
 */
app.get('/api/download-progress', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'YouTube URL is required' });
  }

  const youtubeId = extractYoutubeId(url);
  if (!youtubeId) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  // Set headers for Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendSSE = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    // 1. Double check if it was downloaded while we clicked
    const existingSong = getSongByYoutubeId(youtubeId);
    if (existingSong) {
      sendSSE('complete', { song: existingSong });
      return res.end();
    }

    // 2. Fetch metadata first to get correct title and duration
    sendSSE('status', { message: 'Fetching video metadata...' });
    const info = await getMetadata(url);

    // 3. Start download & audio extraction
    sendSSE('status', { message: 'Downloading and converting audio...' });
    await downloadAndConvert(url, (percent) => {
      sendSSE('progress', { percent });
    });

    // 4. Save to database
    sendSSE('status', { message: 'Saving to library database...' });
    const filename = `${youtubeId}.mp3`;
    const newSong = insertSong({
      youtube_id: youtubeId,
      title: info.title,
      filename,
      duration: info.duration,
      thumbnail: info.thumbnail
    });

    // 5. Complete
    sendSSE('complete', { song: newSong });
    res.end();
  } catch (error) {
    console.error('Download progress SSE error:', error);
    sendSSE('error', { message: error.message });
    res.end();
  }
});

/**
 * Get library songs (with optional text search and tag filters)
 */
app.get('/api/songs', (req, res) => {
  const { search, tags, matchType } = req.query;
  
  let tagsArray = [];
  if (tags) {
    tagsArray = tags.split(',').filter(t => t.trim().length > 0);
  }

  try {
    const songs = getSongs({
      search,
      tags: tagsArray,
      matchType: matchType || 'all'
    });
    res.json(songs);
  } catch (error) {
    console.error('Get songs error:', error);
    res.status(500).json({ error: 'Failed to retrieve songs from library' });
  }
});

/**
 * Get all unique tags
 */
app.get('/api/tags', (req, res) => {
  try {
    const tags = getTags();
    res.json(tags);
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Failed to retrieve tags' });
  }
});

/**
 * Add a tag to a song
 */
app.post('/api/songs/:id/tags', (req, res) => {
  const { id } = req.params;
  const { tag } = req.body;

  if (!tag || !tag.trim()) {
    return res.status(400).json({ error: 'Tag name is required' });
  }

  try {
    const addedTag = addTagToSong(parseInt(id, 10), tag);
    if (!addedTag) {
      return res.status(500).json({ error: 'Failed to associate tag' });
    }
    res.json(addedTag);
  } catch (error) {
    console.error('Add tag error:', error);
    res.status(500).json({ error: 'Failed to add tag to song' });
  }
});

/**
 * Remove a tag from a song
 */
app.delete('/api/songs/:id/tags/:tagId', (req, res) => {
  const { id, tagId } = req.params;

  try {
    removeTagFromSong(parseInt(id, 10), parseInt(tagId, 10));
    res.json({ success: true });
  } catch (error) {
    console.error('Remove tag error:', error);
    res.status(500).json({ error: 'Failed to remove tag from song' });
  }
});

/**
 * Download song with original YouTube title as the file name
 */
app.get('/api/songs/:id/download', (req, res) => {
  const { id } = req.params;
  
  try {
    // Retrieve song to get original title and youtube_id
    const songs = getSongs();
    const song = songs.find(s => s.id === parseInt(id, 10));
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const filePath = path.join(mediaDir, song.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'MP3 file not found on disk' });
    }

    // Set header for user-friendly download filename (sanitize title just in case)
    const sanitizedTitle = song.title.replace(/[\\/:*?"<>|]/g, '_');
    res.download(filePath, `${sanitizedTitle}.mp3`);
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ error: 'Failed to download audio file' });
  }
});

/**
 * Delete a song from the library (database and disk)
 */
app.delete('/api/songs/:id', (req, res) => {
  const { id } = req.params;

  try {
    // Get song info to delete local file
    const songs = getSongs();
    const song = songs.find(s => s.id === parseInt(id, 10));
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Delete file from disk
    const filePath = path.join(mediaDir, song.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete row from database (cascades tag links)
    deleteSong(parseInt(id, 10));

    // Optional: Clean up unused tags globally
    const allTags = getTags();
    for (const tag of allTags) {
      removeTagFromSong(0, tag.id); // This will delete the tag if count of uses is 0
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete song error:', error);
    res.status(500).json({ error: 'Failed to delete song from library' });
  }
});

// Serve frontend in production (if built)
const clientBuildDir = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientBuildDir)) {
  app.use(express.static(clientBuildDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
