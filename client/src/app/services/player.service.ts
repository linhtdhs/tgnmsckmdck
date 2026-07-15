import { Injectable, signal, computed } from '@angular/core';
import { Song } from '../models/song.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private audio = new Audio();

  currentTrack   = signal<Song | null>(null);
  isPlaying      = signal(false);
  isMuted        = signal(false);
  isLooping      = signal(false);
  isShuffling    = signal(false);
  volume         = signal(0.8);
  currentTime    = signal(0);
  duration       = signal(0);

  private songs: Song[] = [];

  constructor(private api: ApiService) {
    this.audio.addEventListener('timeupdate', () => this.currentTime.set(this.audio.currentTime));
    this.audio.addEventListener('loadedmetadata', () => this.duration.set(this.audio.duration));
    this.audio.addEventListener('ended', () => this.handleEnded());
    this.audio.volume = this.volume();
  }

  setSongList(songs: Song[]) { this.songs = songs; }

  play(song: Song) {
    this.audio.src = this.api.getAudioUrl(song.filename);
    this.audio.volume = this.isMuted() ? 0 : this.volume();
    this.audio.loop = this.isLooping();
    this.currentTrack.set(song);
    this.isPlaying.set(true);
    this.audio.play().catch(err => console.error('Audio play error', err));
  }

  togglePlayPause() {
    if (this.isPlaying()) { this.audio.pause(); this.isPlaying.set(false); }
    else                  { this.audio.play();  this.isPlaying.set(true);  }
  }

  stop() {
    this.audio.pause();
    this.audio.src = '';
    this.currentTrack.set(null);
    this.isPlaying.set(false);
    this.currentTime.set(0);
    this.duration.set(0);
  }

  seek(time: number) {
    this.audio.currentTime = time;
  }

  setVolume(v: number) {
    this.volume.set(v);
    if (!this.isMuted()) this.audio.volume = v;
  }

  toggleMute() {
    const muted = !this.isMuted();
    this.isMuted.set(muted);
    this.audio.volume = muted ? 0 : this.volume();
  }

  toggleLoop() {
    const l = !this.isLooping();
    this.isLooping.set(l);
    this.audio.loop = l;
  }

  toggleShuffle() { this.isShuffling.set(!this.isShuffling()); }

  next() {
    if (!this.songs.length) return;
    if (this.isShuffling()) {
      this.play(this.songs[Math.floor(Math.random() * this.songs.length)]);
    } else {
      const i = this.songs.findIndex(s => s.id === this.currentTrack()?.id);
      this.play(this.songs[(i + 1) % this.songs.length]);
    }
  }

  prev() {
    if (!this.songs.length || !this.currentTrack()) return;
    const i = this.songs.findIndex(s => s.id === this.currentTrack()!.id);
    this.play(this.songs[i > 0 ? i - 1 : this.songs.length - 1]);
  }

  private handleEnded() {
    if (!this.isLooping()) this.next();
  }
}
