export interface Tag {
  id: number;
  name: string;
}

export interface Song {
  id: number;
  youtube_id: string;
  title: string;
  filename: string;
  duration: number;
  thumbnail: string | null;
  created_at: string;
  tags: Tag[];
}

export interface VideoInfo {
  youtube_id: string;
  title: string;
  duration: number;
  thumbnail: string | null;
}

export interface CheckLinkResult {
  exists: boolean;
  song?: Song;
  info?: VideoInfo;
}
