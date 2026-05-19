export interface Image {
  id: string;
  filename: string;
  file_path: string;
  taken_at: string | null;
  imported_at: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
  has_exif: boolean;
  date_source: 'exif' | 'filename' | 'mtime' | null;
  thumbnail_path: string | null;
  is_favourite: boolean;
}

export interface Group {
  id: number;
  name: string;
  created_at: string;
  cover_image_id?: string | null;
}

export interface GroupWithCount extends Group {
  image_count: number;
  cover_thumbnail_path?: string | null;
}
