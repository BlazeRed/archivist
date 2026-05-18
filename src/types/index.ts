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
}

export interface Group {
  id: number;
  name: string;
  created_at: string;
}

export interface GroupWithCount extends Group {
  image_count: number;
}
