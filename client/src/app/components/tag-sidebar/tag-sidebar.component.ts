import {
  Component, Input, Output, EventEmitter, signal, inject, OnChanges
} from '@angular/core';
import { Song, Tag } from '../../models/song.model';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-tag-sidebar',
  standalone: true,
  template: `
    <div class="filter-group glass">
      <div class="filter-header">
        <h3 style="font-size:1rem;font-weight:700">Filter by Tags</h3>
        @if (selectedTags().length > 1) {
          <div class="toggle-switch">
            <div class="toggle-option" [class.active]="matchType()==='all'" (click)="matchType.set('all')">Match All</div>
            <div class="toggle-option" [class.active]="matchType()==='any'" (click)="matchType.set('any')">Match Any</div>
          </div>
        }
      </div>

      @if (filteredTags().length === 0 && allTags.length === 0) {
        <p style="font-size:.85rem;color:var(--text-muted);text-align:center;padding:1rem 0">
          No tags yet. Add tags to songs to filter.
        </p>
      } @else if (filteredTags().length === 0) {
        <p style="font-size:.85rem;color:var(--text-muted);text-align:center;padding:1rem 0">
          No matching tags.
        </p>
      } @else {
        <div class="tag-list-filter">
          @for (t of filteredTags(); track t.id) {
            <div class="tag-filter-item" [class.active]="isSelected(t.name)" (click)="toggleTag(t.name)">
              <div class="tag-filter-name">
                <div class="tag-filter-checkbox">
                  @if (isSelected(t.name)) { <div style="width:8px;height:8px;background:#000"></div> }
                </div>
                <span style="text-transform:capitalize">{{ t.name }}</span>
              </div>
            </div>
          }
        </div>
      }

      @if (selectedTags().length > 0) {
        <button class="btn-secondary"
                style="width:100%;margin-top:1rem;font-size:.8rem;display:flex;align-items:center;justify-content:center;gap:.25rem"
                (click)="selectedTags.set([])">
          ✕ Clear filters
        </button>
      }
    </div>
  `
})
export class TagSidebarComponent implements OnChanges {
  @Input() allTags: Tag[] = [];
  @Input() searchQuery    = '';

  selectedTags = signal<string[]>([]);
  matchType    = signal<'all' | 'any'>('all');

  filteredTags = signal<Tag[]>([]);

  ngOnChanges() { this.updateFilteredTags(); }

  private updateFilteredTags() {
    const q = this.removeAccents(this.searchQuery);
    this.filteredTags.set(
      this.allTags.filter(t =>
        this.removeAccents(t.name).includes(q) || this.selectedTags().includes(t.name)
      )
    );
  }

  isSelected(name: string) { return this.selectedTags().includes(name); }

  toggleTag(name: string) {
    this.selectedTags.update(prev =>
      prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
    );
    this.updateFilteredTags();
  }

  private removeAccents(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  }
}
