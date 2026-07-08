import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure the data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Media directory
const mediaDir = path.join(dataDir, 'media');
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'db.sqlite');
const db = new DatabaseSync(dbPath);

// Initialize DB schema
db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    duration INTEGER NOT NULL,
    thumbnail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS song_tags (
    song_id INTEGER,
    tag_id INTEGER,
    PRIMARY KEY (song_id, tag_id),
    FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
  );
`);

// Helpers

/**
 * Gets a song by its YouTube video ID, including its associated tags
 */
export function getSongByYoutubeId(youtubeId) {
  const stmt = db.prepare(`
    SELECT 
      s.id, 
      s.youtube_id, 
      s.title, 
      s.filename, 
      s.duration, 
      s.thumbnail, 
      s.created_at,
      GROUP_CONCAT(t.name) as tags_string,
      GROUP_CONCAT(t.id) as tag_ids_string
    FROM songs s
    LEFT JOIN song_tags st ON s.id = st.song_id
    LEFT JOIN tags t ON st.tag_id = t.id
    WHERE s.youtube_id = ?
    GROUP BY s.id
  `);
  
  const row = stmt.get(youtubeId);
  if (!row) return null;

  const tags = row.tags_string 
    ? row.tags_string.split(',').map((name, index) => ({
        id: parseInt(row.tag_ids_string.split(',')[index], 10),
        name
      }))
    : [];

  const song = { ...row };
  delete song.tags_string;
  delete song.tag_ids_string;
  song.tags = tags;
  return song;
}

/**
 * Inserts a new song into the database
 */
export function insertSong({ youtube_id, title, filename, duration, thumbnail }) {
  const stmt = db.prepare(`
    INSERT INTO songs (youtube_id, title, filename, duration, thumbnail)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(youtube_id, title, filename, duration, thumbnail);
  return { 
    id: result.lastInsertRowid, 
    youtube_id, 
    title, 
    filename, 
    duration, 
    thumbnail,
    tags: [] 
  };
}

/**
 * Deletes a song from the database
 */
export function deleteSong(id) {
  const stmt = db.prepare('DELETE FROM songs WHERE id = ?');
  return stmt.run(id);
}

/**
 * Adds a tag to a song, creating the tag if it doesn't exist
 */
export function addTagToSong(songId, tagName) {
  const cleanTagName = tagName.trim().toLowerCase();
  if (!cleanTagName) return null;

  // Insert tag or ignore if it exists
  const insertTagStmt = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  insertTagStmt.run(cleanTagName);

  // Get tag ID
  const getTagStmt = db.prepare('SELECT id FROM tags WHERE name = ?');
  const tag = getTagStmt.get(cleanTagName);
  if (!tag) return null;

  // Link song and tag
  const insertLinkStmt = db.prepare('INSERT OR IGNORE INTO song_tags (song_id, tag_id) VALUES (?, ?)');
  insertLinkStmt.run(songId, tag.id);

  return { id: tag.id, name: cleanTagName };
}

/**
 * Removes a tag link from a song. If the tag is no longer linked to any song, delete the tag itself.
 */
export function removeTagFromSong(songId, tagId) {
  const deleteLinkStmt = db.prepare('DELETE FROM song_tags WHERE song_id = ? AND tag_id = ?');
  deleteLinkStmt.run(songId, tagId);

  // Clean up unused tags
  const deleteUnusedTagsStmt = db.prepare(`
    DELETE FROM tags
    WHERE id = ? AND id NOT IN (SELECT DISTINCT tag_id FROM song_tags)
  `);
  deleteUnusedTagsStmt.run(tagId);
}

/**
 * Gets all tags
 */
export function getTags() {
  const stmt = db.prepare('SELECT * FROM tags ORDER BY name ASC');
  return stmt.all();
}

/**
 * Gets all songs matching optional search and tag filters
 */
export function getSongs({ search, tags = [], matchType = 'all' } = {}) {
  let params = [];
  let filterSql = '';

  // 1. Handle tag filters (intersection or union)
  if (tags && tags.length > 0) {
    const placeholders = tags.map(() => '?').join(',');
    params = params.concat(tags.map(t => t.trim().toLowerCase()));

    if (matchType === 'all') {
      // Intersection: must have all specified tags
      filterSql += `
        AND s.id IN (
          SELECT st.song_id 
          FROM song_tags st 
          JOIN tags t ON st.tag_id = t.id 
          WHERE t.name IN (${placeholders})
          GROUP BY st.song_id
          HAVING COUNT(DISTINCT t.id) = ?
        )
      `;
      params.push(tags.length);
    } else {
      // Union: must have at least one of the tags
      filterSql += `
        AND s.id IN (
          SELECT DISTINCT st.song_id 
          FROM song_tags st 
          JOIN tags t ON st.tag_id = t.id 
          WHERE t.name IN (${placeholders})
        )
      `;
    }
  }

  // 2. Handle search filter (search in title or tag names)
  if (search && search.trim()) {
    const searchVal = `%${search.trim().toLowerCase()}%`;
    filterSql += `
      AND (
        LOWER(s.title) LIKE ? 
        OR s.id IN (
          SELECT st.song_id 
          FROM song_tags st 
          JOIN tags t ON st.tag_id = t.id 
          WHERE LOWER(t.name) LIKE ?
        )
      )
    `;
    params.push(searchVal, searchVal);
  }

  // Combine query and aggregate tags
  const sql = `
    SELECT 
      s.id, 
      s.youtube_id, 
      s.title, 
      s.filename, 
      s.duration, 
      s.thumbnail, 
      s.created_at,
      GROUP_CONCAT(t.name) as tags_string,
      GROUP_CONCAT(t.id) as tag_ids_string
    FROM songs s
    LEFT JOIN song_tags st ON s.id = st.song_id
    LEFT JOIN tags t ON st.tag_id = t.id
    WHERE 1=1 ${filterSql}
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `;

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params);

  // Map results to format tags as arrays
  return rows.map(row => {
    const tags = row.tags_string 
      ? row.tags_string.split(',').map((name, index) => ({
          id: parseInt(row.tag_ids_string.split(',')[index], 10),
          name
        }))
      : [];
    
    // Clean up temporary string columns from SQL query
    const song = { ...row };
    delete song.tags_string;
    delete song.tag_ids_string;
    song.tags = tags;
    return song;
  });
}
