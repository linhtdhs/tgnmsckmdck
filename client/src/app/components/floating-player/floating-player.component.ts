import { Component, inject, effect } from '@angular/core';
import { PlayerService } from '../../services/player.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-floating-player',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './floating-player.component.html'
})
export class FloatingPlayerComponent {
  player = inject(PlayerService);

  get track()    { return this.player.currentTrack(); }
  get playing()  { return this.player.isPlaying();    }
  get muted()    { return this.player.isMuted();      }
  get looping()  { return this.player.isLooping();    }
  get shuffling(){ return this.player.isShuffling();  }
  get volume()   { return this.player.volume();       }
  get current()  { return this.player.currentTime();  }
  get total()    { return this.player.duration();     }

  get tagList()  {
    return this.track?.tags.map(t => t.name).join(', ') || 'No tags';
  }

  get statusLabel() {
    return this.playing ? '⚡ NOW PLAYING ⚡' : '❚❚ PAUSED';
  }

  close()      { this.player.stop();         }
  togglePlay() { this.player.togglePlayPause(); }
  next()       { this.player.next();           }
  prev()       { this.player.prev();           }
  toggleMute() { this.player.toggleMute();     }
  toggleLoop() { this.player.toggleLoop();     }
  toggleShuffle() { this.player.toggleShuffle(); }

  onScrub(e: Event) {
    this.player.seek(+(e.target as HTMLInputElement).value);
  }

  onVolume(e: Event) {
    this.player.setVolume(+(e.target as HTMLInputElement).value);
  }

  formatTime(sec: number): string {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
