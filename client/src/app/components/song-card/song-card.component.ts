import {
  Component, Input, Output, EventEmitter,
  signal, inject
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Song } from '../../models/song.model';
import { ApiService } from '../../services/api.service';
import { PlayerService } from '../../services/player.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-song-card',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './song-card.component.html'
})
export class SongCardComponent {
  @Input({ required: true }) song!: Song;
  @Output() deleted  = new EventEmitter<number>();
  @Output() tagAdded = new EventEmitter<Song>();
  @Output() tagRemoved = new EventEmitter<Song>();

  api    = inject(ApiService);
  player = inject(PlayerService);
  toasts = inject(ToastService);

  showTagInput = signal(false);
  tagValue     = signal('');

  get isPlaying() { return this.player.currentTrack()?.id === this.song.id; }

  play() { this.player.play(this.song); }

  deleteSong() {
    this.api.deleteSong(this.song.id).subscribe({
      next: () => { this.toasts.show(`"${this.song.title}" deleted`); this.deleted.emit(this.song.id); },
      error: () => this.toasts.show('Failed to delete song', 'error')
    });
  }

  addTag() {
    const v = this.tagValue().trim();
    if (!v) return;
    this.api.addTag(this.song.id, v).subscribe({
      next: tag => {
        this.song.tags.push(tag);
        this.tagValue.set('');
        this.showTagInput.set(false);
        this.toasts.show(`Tag "${tag.name}" added`);
        this.tagAdded.emit({ ...this.song });
      },
      error: () => this.toasts.show('Failed to add tag', 'error')
    });
  }

  removeTag(tagId: number, tagName: string) {
    this.api.removeTag(this.song.id, tagId).subscribe({
      next: () => {
        this.song.tags = this.song.tags.filter(t => t.id !== tagId);
        this.toasts.show(`Tag removed`);
        this.tagRemoved.emit({ ...this.song });
      },
      error: () => this.toasts.show('Failed to remove tag', 'error')
    });
  }

  formatTime(sec: number): string {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  onTagKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter')  { this.addTag(); }
    if (event.key === 'Escape') { this.showTagInput.set(false); this.tagValue.set(''); }
  }
}
