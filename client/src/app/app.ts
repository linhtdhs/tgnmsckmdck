import { Component, inject, signal, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { ApiService }     from './services/api.service';
import { PlayerService }  from './services/player.service';
import { ToastService }   from './services/toast.service';
import { Song, Tag }      from './models/song.model';
import { LinkInputComponent }    from './components/link-input/link-input.component';
import { SongCardComponent }     from './components/song-card/song-card.component';
import { TagSidebarComponent }   from './components/tag-sidebar/tag-sidebar.component';
import { FloatingPlayerComponent } from './components/floating-player/floating-player.component';
import { ToastComponent }         from './components/toast/toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FormsModule,
    HttpClientModule,
    LinkInputComponent,
    SongCardComponent,
    TagSidebarComponent,
    FloatingPlayerComponent,
    ToastComponent
  ],
  templateUrl: './app.html'
})
export class App implements OnInit {
  private api   = inject(ApiService);
  private player = inject(PlayerService);

  songs    = signal<Song[]>([]);
  tags     = signal<Tag[]>([]);
  search   = signal('');
  loading  = signal(false);

  @ViewChild(TagSidebarComponent) sidebar!: TagSidebarComponent;

  ngOnInit() {
    this.loadSongs();
    this.loadTags();
  }

  loadSongs() {
    this.loading.set(true);
    const sel  = this.sidebar?.selectedTags() ?? [];
    const type = this.sidebar?.matchType()    ?? 'all';
    this.api.getSongs(this.search(), sel, type).subscribe({
      next: songs => {
        this.songs.set(songs);
        this.player.setSongList(songs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  loadTags() {
    this.api.getTags().subscribe(tags => this.tags.set(tags));
  }

  onSongDownloaded(_song: Song) {
    this.loadSongs();
    this.loadTags();
  }

  onSongDeleted(id: number) {
    this.songs.update(s => s.filter(x => x.id !== id));
    this.loadTags();
    if (this.player.currentTrack()?.id === id) this.player.stop();
  }

  onTagChanged(_song: Song) { this.loadTags(); this.loadSongs(); }

  onSearch(q: string) { this.search.set(q); this.loadSongs(); }
  onFilterChange()     { this.loadSongs(); }
}
