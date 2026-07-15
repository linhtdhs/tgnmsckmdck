import { Component, EventEmitter, inject, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { Song, VideoInfo } from '../../models/song.model';

type ValidationResult =
  | { kind: 'exists'; song: Song }
  | { kind: 'new'; info: VideoInfo };

@Component({
  selector: 'app-link-input',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './link-input.component.html'
})
export class LinkInputComponent {
  @Output() songDownloaded = new EventEmitter<Song>();

  private api    = inject(ApiService);
  private toasts = inject(ToastService);

  urlInput       = '';
  isValidating   = signal(false);
  downloading    = signal(false);
  downloadProgress = signal(0);
  downloadStatus   = signal('');
  validationResult = signal<ValidationResult | null>(null);
  justDownloadedSong = signal<Song | null>(null);
  suggestedTagInput  = '';
  downloadedTagInput = '';

  private eventSource: EventSource | null = null;

  formatTime(sec: number): string {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async submitUrl() {
    const url = this.urlInput.trim();
    if (!url) return;
    this.isValidating.set(true);
    this.validationResult.set(null);

    this.api.checkLink(url).subscribe({
      next: res => {
        this.isValidating.set(false);
        if (res.exists && res.song) {
          this.validationResult.set({ kind: 'exists', song: res.song });
        } else if (res.info) {
          this.validationResult.set({ kind: 'new', info: res.info });
        }
      },
      error: err => {
        this.isValidating.set(false);
        this.toasts.show(err.error?.error || 'Failed to check link', 'error');
      }
    });
  }

  startDownload() {
    const url = this.urlInput.trim();
    if (!url) return;
    this.validationResult.set(null);
    this.downloading.set(true);
    this.downloadProgress.set(0);
    this.downloadStatus.set('Starting...');

    this.eventSource = this.api.openDownloadSSE(url);
    this.eventSource.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      const d = msg.data ?? msg;
      const type = msg.type;
      if (type === 'status')   this.downloadStatus.set(d.message ?? d);
      if (type === 'progress') this.downloadProgress.set(d.percent ?? d);
      if (type === 'complete') {
        this.downloading.set(false);
        this.downloadProgress.set(100);
        this.eventSource?.close();
        this.justDownloadedSong.set(d as Song);
        this.validationResult.set(null);
        this.urlInput = '';
        this.toasts.show(`"${(d as Song).title}" added to library!`);
      }
      if (type === 'error') {
        this.downloading.set(false);
        this.eventSource?.close();
        this.toasts.show(d.message ?? 'Download failed', 'error');
      }
    };
    this.eventSource.onerror = () => {
      this.downloading.set(false);
      this.eventSource?.close();
      this.toasts.show('Connection to server lost', 'error');
    };
  }

  addTagToDownloadedSong(tagInput: string) {
    const song = this.justDownloadedSong();
    if (!song || !tagInput.trim()) return;
    this.api.addTag(song.id, tagInput.trim()).subscribe({
      next: tag => {
        song.tags.push(tag);
        this.toasts.show(`Tag "${tag.name}" added`);
        this.songDownloaded.emit({ ...song });
      },
      error: () => this.toasts.show('Failed to add tag', 'error')
    });
  }

  addTagToExistingSong(tagInput: string) {
    const res = this.validationResult();
    if (!res || res.kind !== 'exists') return;
    this.api.addTag(res.song.id, tagInput.trim()).subscribe({
      next: tag => {
        res.song.tags.push(tag);
        this.toasts.show(`Tag "${tag.name}" added`);
        this.validationResult.set(null);
        this.urlInput = '';
        this.songDownloaded.emit({ ...res.song });
      },
      error: () => this.toasts.show('Failed to add tag', 'error')
    });
  }

  dismissDownloaded() { this.justDownloadedSong.set(null); }
  dismissValidation() { this.validationResult.set(null); }
}
