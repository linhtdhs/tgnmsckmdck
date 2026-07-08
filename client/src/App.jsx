import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Search, 
  Tag, 
  Music, 
  Link as LinkIcon, 
  Download, 
  Trash2, 
  X, 
  Plus, 
  Volume2, 
  VolumeX, 
  Shuffle, 
  RotateCcw, 
  CheckCircle, 
  Loader2 
} from 'lucide-react';

const API_BASE = window.location.port === '5173' ? 'http://localhost:3001' : window.location.origin;

export default function App() {
  // Library State
  const [songs, setSongs] = useState([]);
  const [tags, setTags] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [matchType, setMatchType] = useState('all'); // 'all' (intersection) or 'any' (union)

  // YouTube pasting form
  const [urlInput, setUrlInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null); // { exists: boolean, song/info }
  
  // Downloading & converting SSE state
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('');

  // Toast notifications
  const [toasts, setToasts] = useState([]);

  // Newly downloaded song (to prompt for tag)
  const [justDownloadedSong, setJustDownloadedSong] = useState(null);

  // Audio Player State
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  
  // Inline tag entry
  const [activeInlineTagInput, setActiveInlineTagInput] = useState(null); // songId
  const [inlineTagValue, setInlineTagValue] = useState('');

  const audioRef = useRef(null);
  const progressIntervalRef = useRef(null);

  // Initialize
  useEffect(() => {
    fetchSongs();
    fetchTags();
  }, [selectedTags, matchType]); // Re-fetch when filters change

  // Custom toast notification trigger
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Fetch API Wrapper
  const fetchSongs = async () => {
    try {
      const tagsParam = selectedTags.join(',');
      const searchParam = encodeURIComponent(searchQuery);
      const url = `${API_BASE}/api/songs?search=${searchParam}&tags=${tagsParam}&matchType=${matchType}`;
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load songs');
      const data = await res.json();
      setSongs(data);
    } catch (err) {
      showToast('Error loading library songs', 'error');
    }
  };

  const fetchTags = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tags`);
      if (!res.ok) throw new Error('Failed to load tags');
      const data = await res.json();
      setTags(data);
    } catch (err) {
      showToast('Error loading tags list', 'error');
    }
  };

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSongs();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle URL Pasting & Validation
  const handleCheckLink = async (e) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsValidating(true);
    setValidationResult(null);
    setJustDownloadedSong(null);
    try {
      const res = await fetch(`${API_BASE}/api/check-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid link');
      }

      setValidationResult(data);
      if (data.exists) {
        showToast('Song is already available in the library!');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsValidating(false);
    }
  };

  // Download video & convert to MP3 via Server-Sent Events (SSE)
  const handleDownload = () => {
    if (!urlInput.trim()) return;

    setDownloading(true);
    setDownloadProgress(0);
    setDownloadStatus('Initializing connection...');

    const url = `${API_BASE}/api/download-progress?url=${encodeURIComponent(urlInput)}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'status') {
        setDownloadStatus(data.message);
      } else if (data.type === 'progress') {
        setDownloadProgress(data.percent);
        setDownloadStatus(`Downloading: ${data.percent.toFixed(1)}%`);
      } else if (data.type === 'complete') {
        eventSource.close();
        setDownloading(false);
        setValidationResult(null);
        setUrlInput('');
        showToast(`Successfully downloaded "${data.song.title}"!`);
        fetchSongs();
        fetchTags();
        // Save the downloaded song details to prompt user to add a tag
        setJustDownloadedSong(data.song);
        // Automatically play the new track!
        playTrack(data.song);
      } else if (data.type === 'error') {
        eventSource.close();
        setDownloading(false);
        showToast(data.message, 'error');
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      eventSource.close();
      setDownloading(false);
      showToast('Connection to server lost during download', 'error');
    };
  };

  // Tags Management
  const handleAddTag = async (songId, tagName) => {
    if (!tagName.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/api/songs/${songId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: tagName })
      });

      if (!res.ok) throw new Error('Failed to add tag');
      const newTag = await res.json();
      
      showToast(`Added tag "${newTag.name}"`);
      fetchSongs();
      fetchTags();
      
      // Update active track view if this song is playing
      if (currentTrack && currentTrack.id === songId) {
        setCurrentTrack(prev => {
          if (prev.tags.some(t => t.id === newTag.id)) return prev;
          return { ...prev, tags: [...prev.tags, newTag] };
        });
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRemoveTag = async (songId, tagId) => {
    try {
      const res = await fetch(`${API_BASE}/api/songs/${songId}/tags/${tagId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Failed to remove tag');
      
      showToast('Tag removed');
      fetchSongs();
      fetchTags();

      // Update active track view if this song is playing
      if (currentTrack && currentTrack.id === songId) {
        setCurrentTrack(prev => ({
          ...prev,
          tags: prev.tags.filter(t => t.id !== tagId)
        }));
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteSong = async (songId) => {
    if (!confirm('Are you sure you want to delete this song from your library?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/songs/${songId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Failed to delete song');

      showToast('Song deleted from library');
      fetchSongs();
      fetchTags();

      // Stop playing if deleted song is active
      if (currentTrack && currentTrack.id === songId) {
        stopTrack();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Audio Player Operations
  const playTrack = (song) => {
    if (audioRef.current) {
      audioRef.current.src = `${API_BASE}/audio/${song.filename}`;
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.loop = isLooping;
      
      setCurrentTrack(song);
      setIsPlaying(true);
      
      audioRef.current.play().catch(err => {
        console.error('Audio play error:', err);
        showToast('Failed to start audio playback', 'error');
      });
    }
  };

  const togglePlayPause = () => {
    if (!currentTrack && songs.length > 0) {
      playTrack(songs[0]);
      return;
    }
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(err => console.error(err));
      setIsPlaying(true);
    }
  };

  const stopTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setCurrentTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

  // Audio Events Sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      handleNextTrack();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentTrack, songs, isShuffling, isLooping]);

  const handleScrubChange = (e) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(false);
    if (audioRef.current) {
      audioRef.current.volume = val;
      audioRef.current.muted = false;
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (audioRef.current) {
      audioRef.current.muted = nextMute;
    }
  };

  const toggleLoop = () => {
    const nextLoop = !isLooping;
    setIsLooping(nextLoop);
    if (audioRef.current) {
      audioRef.current.loop = nextLoop;
    }
  };

  const handleNextTrack = () => {
    if (songs.length === 0) return;
    
    let nextSong = null;
    if (isShuffling) {
      const randomIndex = Math.floor(Math.random() * songs.length);
      nextSong = songs[randomIndex];
    } else if (currentTrack) {
      const currentIndex = songs.findIndex(s => s.id === currentTrack.id);
      if (currentIndex !== -1 && currentIndex < songs.length - 1) {
        nextSong = songs[currentIndex + 1];
      } else {
        // Wrap around to start
        nextSong = songs[0];
      }
    } else {
      nextSong = songs[0];
    }
    
    if (nextSong) {
      playTrack(nextSong);
    }
  };

  const handlePrevTrack = () => {
    if (songs.length === 0 || !currentTrack) return;
    
    let prevSong = null;
    const currentIndex = songs.findIndex(s => s.id === currentTrack.id);
    if (currentIndex !== -1 && currentIndex > 0) {
      prevSong = songs[currentIndex - 1];
    } else {
      // Wrap around to end
      prevSong = songs[songs.length - 1];
    }
    
    if (prevSong) {
      playTrack(prevSong);
    }
  };

  // Filters Toggles
  const handleTagToggle = (tagName) => {
    setSelectedTags(prev => 
      prev.includes(tagName)
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  };

  const formatTime = (secs) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="app-container">
      {/* Background blobs for premium depth */}
      <div className="bg-glow glow-top-left"></div>
      <div className="bg-glow glow-bottom-right"></div>

      {/* Global Toast Alerts */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <CheckCircle size={16} />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      <header className="app-header">
        <div className="brand">
          <Music size={32} strokeWidth={2.5} style={{ color: 'var(--accent-cyan)' }} />
          <span>tgensic</span>
        </div>
      </header>

      {/* URL Link Input Section */}
      <section className="link-section glass">
        <h2 className="section-title">
          <LinkIcon size={18} style={{ color: 'var(--accent-cyan)' }} />
          <span>Add New Song</span>
        </h2>
        <form onSubmit={handleCheckLink} className="input-group">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste a YouTube video link (e.g. https://www.youtube.com/watch?v=...)"
            className="url-input"
            disabled={downloading || isValidating}
            required
          />
          <button 
            type="submit" 
            className="btn-primary" 
            disabled={downloading || isValidating}
          >
            {isValidating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Checking...</span>
              </>
            ) : (
              <span>Check Link</span>
            )}
          </button>
        </form>

        {/* Live download progress display */}
        {downloading && (
          <div className="progress-card">
            <div className="progress-details">
              <div className="progress-title">{downloadStatus}</div>
              <div className="progress-bar-container">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${downloadProgress}%` }}
                ></div>
              </div>
              <div className="progress-status-text">
                <span>{downloadProgress.toFixed(0)}% Completed</span>
                <span>Converting to MP3</span>
              </div>
            </div>
          </div>
        )}

        {/* Action Suggestion Card based on validation */}
        {validationResult && !downloading && (
          <div className="success-action-card">
            {validationResult.exists ? (
              <div>
                <p style={{ fontWeight: '600' }}>
                  🎉 "{validationResult.song.title}" is already in your local storage!
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  Assign custom tags to this song so you can easily include it in tag playlists.
                </p>
                <div className="tag-suggestion-group">
                  <input
                    type="text"
                    placeholder="Enter custom tag..."
                    className="tag-input-inline"
                    id={`suggested-tag-${validationResult.song.id}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddTag(validationResult.song.id, e.target.value);
                        e.target.value = '';
                        setValidationResult(null);
                        setUrlInput('');
                      }
                    }}
                  />
                  <button 
                    className="btn-primary"
                    onClick={() => {
                      const input = document.getElementById(`suggested-tag-${validationResult.song.id}`);
                      if (input) {
                        handleAddTag(validationResult.song.id, input.value);
                        input.value = '';
                        setValidationResult(null);
                        setUrlInput('');
                      }
                    }}
                  >
                    Add Tag
                  </button>
                  <button className="btn-secondary" onClick={() => setValidationResult(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                <img 
                  className="progress-thumbnail" 
                  src={validationResult.info.thumbnail} 
                  alt={validationResult.info.title} 
                />
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: '600', fontSize: '1rem', lineHeight: '1.4' }}>
                    {validationResult.info.title}
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                    Duration: {formatTime(validationResult.info.duration)}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button className="btn-primary" onClick={handleDownload}>
                      <Download size={16} />
                      <span>Convert and Save to Library</span>
                    </button>
                    <button className="btn-secondary" onClick={() => setValidationResult(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Success / Add Tag Card for newly downloaded song */}
        {justDownloadedSong && !downloading && (
          <div className="success-action-card" style={{ background: 'rgba(52, 211, 153, 0.05)', borderColor: 'rgba(52, 211, 153, 0.2)' }}>
            <div>
              <p style={{ fontWeight: '600', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={18} />
                <span>Successfully downloaded and added to library!</span>
              </p>
              <p style={{ fontSize: '1.1rem', fontWeight: '700', marginTop: '0.5rem', color: 'var(--text-primary)' }}>
                "{justDownloadedSong.title}"
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                Would you like to assign a custom tag to this new song right now?
              </p>
              <div className="tag-suggestion-group" style={{ marginTop: '1rem' }}>
                <input
                  type="text"
                  placeholder="Enter tag (e.g. Pop, Chill, Rock)..."
                  className="tag-input-inline"
                  id={`downloaded-tag-${justDownloadedSong.id}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddTag(justDownloadedSong.id, e.target.value);
                      e.target.value = '';
                      setJustDownloadedSong(null);
                    }
                  }}
                />
                <button 
                  className="btn-primary"
                  onClick={() => {
                    const input = document.getElementById(`downloaded-tag-${justDownloadedSong.id}`);
                    if (input && input.value.trim()) {
                      handleAddTag(justDownloadedSong.id, input.value);
                      input.value = '';
                      setJustDownloadedSong(null);
                    }
                  }}
                >
                  Add Tag
                </button>
                <button className="btn-secondary" onClick={() => setJustDownloadedSong(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Main Music Library Dashboard */}
      <section className="library-layout">
        {/* Sidebar Filters */}
        <aside className="sidebar">
          <div className="filter-group glass">
            <div className="filter-header">
              <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>Filter by Tags</h3>
              {selectedTags.length > 1 && (
                <div className="toggle-switch">
                  <div 
                    className={`toggle-option ${matchType === 'all' ? 'active' : ''}`}
                    onClick={() => setMatchType('all')}
                    title="Match all selected tags (Intersection)"
                  >
                    Match All
                  </div>
                  <div 
                    className={`toggle-option ${matchType === 'any' ? 'active' : ''}`}
                    onClick={() => setMatchType('any')}
                    title="Match any of the tags (Union)"
                  >
                    Match Any
                  </div>
                </div>
              )}
            </div>

            {tags.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>
                No tags created yet. Add tags to songs in the cards to filter.
              </p>
            ) : (
              <div className="tag-list-filter">
                {tags.map(t => {
                  const isChecked = selectedTags.includes(t.name);
                  return (
                    <div 
                      key={t.id} 
                      className={`tag-filter-item ${isChecked ? 'active' : ''}`}
                      onClick={() => handleTagToggle(t.name)}
                    >
                      <div className="tag-filter-name">
                        <div className="tag-filter-checkbox">
                          {isChecked && <div style={{ width: 8, height: 8, borderRadius: 1, backgroundColor: '#000' }}></div>}
                        </div>
                        <span style={{ textTransform: 'capitalize' }}>{t.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {selectedTags.length > 0 && (
              <button 
                className="btn-secondary" 
                style={{ width: '100%', marginTop: '1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                onClick={() => setSelectedTags([])}
              >
                <X size={14} />
                <span>Clear filters</span>
              </button>
            )}
          </div>
        </aside>

        {/* Search & Grid View */}
        <main className="main-content">
          <div className="search-container">
            <Search className="search-icon-fixed" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search song title or tag name..."
              className="search-input"
            />
            {searchQuery && (
              <button 
                style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setSearchQuery('')}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="song-grid">
            {songs.length === 0 ? (
              <div className="empty-library">
                <Music className="empty-library-icon" />
                <p style={{ fontWeight: '500' }}>No songs found in the library</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '-0.5rem' }}>
                  {selectedTags.length > 0 || searchQuery.trim() 
                    ? 'Try clearing your active tags filter or search query.' 
                    : 'Paste a YouTube video link above to download and catalog your first song!'}
                </p>
              </div>
            ) : (
              songs.map(song => {
                const isActiveTrack = currentTrack && currentTrack.id === song.id;
                return (
                  <div 
                    key={song.id} 
                    className={`song-card glass ${isActiveTrack ? 'playing' : ''}`}
                  >
                    <div 
                      className="song-thumbnail-wrapper"
                      onClick={() => playTrack(song)}
                    >
                      <img 
                        src={song.thumbnail || 'https://placehold.co/600x400/10141f/f3f4f6?text=No+Thumbnail'} 
                        alt={song.title} 
                        className="song-card-thumbnail"
                      />
                      <div className="song-card-overlay">
                        <button className="play-overlay-btn">
                          {isActiveTrack && isPlaying ? <Pause size={20} fill="#000" /> : <Play size={20} fill="#000" style={{ marginLeft: 3 }} />}
                        </button>
                      </div>
                      <div className="duration-tag">
                        {formatTime(song.duration)}
                      </div>
                    </div>

                    <div className="song-info">
                      <h3 
                        className="song-card-title" 
                        onClick={() => playTrack(song)}
                        title={song.title}
                      >
                        {song.title}
                      </h3>
                      
                      <div className="song-card-tags">
                        {(song.tags || []).map(t => (
                          <span key={t.id} className="song-tag-badge">
                            <Tag size={10} />
                            <span style={{ textTransform: 'capitalize' }}>{t.name}</span>
                            <button 
                              className="btn-tag-delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveTag(song.id, t.id);
                              }}
                              title="Delete tag"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}

                        {activeInlineTagInput === song.id ? (
                          <div style={{ display: 'flex', gap: '0.25rem', width: '100%', marginTop: '0.25rem' }} onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              value={inlineTagValue}
                              onChange={(e) => setInlineTagValue(e.target.value)}
                              placeholder="New tag..."
                              className="tag-input-inline"
                              style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem', flex: 1 }}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleAddTag(song.id, inlineTagValue);
                                  setActiveInlineTagInput(null);
                                  setInlineTagValue('');
                                } else if (e.key === 'Escape') {
                                  setActiveInlineTagInput(null);
                                  setInlineTagValue('');
                                }
                              }}
                            />
                            <button 
                              className="action-btn"
                              onClick={() => {
                                handleAddTag(song.id, inlineTagValue);
                                setActiveInlineTagInput(null);
                                setInlineTagValue('');
                              }}
                              style={{ padding: '0.15rem 0.35rem' }}
                            >
                              Add
                            </button>
                            <button 
                              className="action-btn"
                              onClick={() => {
                                setActiveInlineTagInput(null);
                                setInlineTagValue('');
                              }}
                              style={{ padding: '0.15rem 0.35rem' }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <button 
                            className="add-tag-inline-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveInlineTagInput(song.id);
                            }}
                          >
                            <Plus size={10} style={{ display: 'inline', marginRight: 2 }} />
                            <span>Add Tag</span>
                          </button>
                        )}
                      </div>

                      <div className="song-card-footer">
                        <span className="song-date">
                          {new Date(song.created_at).toLocaleDateString()}
                        </span>
                        <div className="song-actions-buttons" onClick={e => e.stopPropagation()}>
                          <a 
                            href={`${API_BASE}/api/songs/${song.id}/download`} 
                            className="action-btn" 
                            title="Download MP3"
                          >
                            <Download size={14} />
                          </a>
                          <button 
                            className="action-btn delete-btn" 
                            onClick={() => handleDeleteSong(song.id)}
                            title="Delete Song"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>
      </section>

      {/* Floating Bottom Audio Player */}
      {currentTrack && (
        <div className={`floating-player glass ${isPlaying ? 'playing' : ''}`}>
          {/* Progress scrubber bar */}
          <div className="scrub-row">
            <span className="player-time">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={handleScrubChange}
              className="slider-input"
            />
            <span className="player-time">{formatTime(duration)}</span>
          </div>

          <div className="player-main-layout">
            {/* Left track details */}
            <div className="player-track-info">
              <img 
                src={currentTrack.thumbnail || 'https://placehold.co/120x120/10141f/f3f4f6?text=MP3'} 
                alt={currentTrack.title} 
                className="player-thumbnail"
              />
              <div className="player-text-details">
                <div className="player-track-title" title={currentTrack.title}>
                  {currentTrack.title}
                </div>
                <div className="player-track-tags">
                  {currentTrack.tags && currentTrack.tags.length > 0 
                    ? currentTrack.tags.map(t => t.name).join(', ')
                    : 'No tags'}
                </div>
              </div>
              {/* Equalizer animation when playing */}
              <div className="eq-container">
                <div className="eq-bar eq-bar-1"></div>
                <div className="eq-bar eq-bar-2"></div>
                <div className="eq-bar eq-bar-3"></div>
              </div>
            </div>

            {/* Center controls */}
            <div className="player-controls">
              <div className="control-buttons-row">
                <button 
                  className={`player-btn ${isShuffling ? 'active' : ''}`} 
                  onClick={() => setIsShuffling(!isShuffling)}
                  title="Shuffle"
                >
                  <Shuffle size={16} />
                </button>
                
                <button className="player-btn" onClick={handlePrevTrack} title="Previous">
                  <Play size={18} style={{ transform: 'rotate(180deg)' }} fill="currentColor" />
                </button>

                <button className="player-btn-main" onClick={togglePlayPause} title={isPlaying ? 'Pause' : 'Play'}>
                  {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 3 }} />}
                </button>

                <button className="player-btn" onClick={handleNextTrack} title="Next">
                  <Play size={18} fill="currentColor" />
                </button>

                <button 
                  className={`player-btn ${isLooping ? 'active' : ''}`} 
                  onClick={toggleLoop}
                  title="Loop"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>

            {/* Right volume & actions */}
            <div className="player-utility">
              <div className="volume-control">
                <button className="player-btn" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                  {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="slider-input"
                />
              </div>
              <button className="player-btn" onClick={stopTrack} title="Close Player">
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden audio element */}
      <audio ref={audioRef} />
    </div>
  );
}
