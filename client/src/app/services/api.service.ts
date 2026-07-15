import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Song, Tag, CheckLinkResult } from '../models/song.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly base =
    window.location.port === '4200' ? 'http://localhost:3001' : window.location.origin;

  constructor(private http: HttpClient) {}

  checkLink(url: string): Observable<CheckLinkResult> {
    return this.http.post<CheckLinkResult>(`${this.base}/api/check-link`, { url });
  }

  getSongs(search = '', tags: string[] = [], matchType = 'all'): Observable<Song[]> {
    const params = new HttpParams()
      .set('search', search)
      .set('tags', tags.join(','))
      .set('matchType', matchType);
    return this.http.get<Song[]>(`${this.base}/api/songs`, { params });
  }

  getTags(): Observable<Tag[]> {
    return this.http.get<Tag[]>(`${this.base}/api/tags`);
  }

  addTag(songId: number, tag: string): Observable<Tag> {
    return this.http.post<Tag>(`${this.base}/api/songs/${songId}/tags`, { tag });
  }

  removeTag(songId: number, tagId: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/api/songs/${songId}/tags/${tagId}`);
  }

  deleteSong(songId: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/api/songs/${songId}`);
  }

  getDownloadUrl(songId: number): string {
    return `${this.base}/api/songs/${songId}/download`;
  }

  getAudioUrl(filename: string): string {
    return `${this.base}/audio/${filename}`;
  }

  /** Open an EventSource for SSE download progress. Caller is responsible for .close() */
  openDownloadSSE(url: string): EventSource {
    return new EventSource(
      `${this.base}/api/download-progress?url=${encodeURIComponent(url)}`
    );
  }
}
