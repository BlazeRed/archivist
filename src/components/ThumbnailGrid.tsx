import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { convertFileSrc } from '@tauri-apps/api/core';

const SIZES = {
  small: { px: 120, cols: 6, gap: 8, gridCols: 6 },
  medium: { px: 180, cols: 4, gap: 10, gridCols: 4 },
  large: { px: 280, cols: 3, gap: 12, gridCols: 3 },
};

export function ThumbnailGrid() {
  const { t } = useTranslation();
  const { images, selectImage, loading } = useTimelineStore();
  const { config } = useAppConfigStore();

  const size = SIZES[config.thumbnail_size];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[#002D58] opacity-55">{t('common.loading')}</p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[#002D58] opacity-55">{t('timeline.noPhotos')}</p>
      </div>
    );
  }

  return (
    <div 
      className="grid gap-2"
      style={{ 
        gridTemplateColumns: `repeat(${size.gridCols}, minmax(${size.px}px, 1fr))` 
      }}
    >
      {images.map((image) => {
        const imageUrl = config.archive_path 
          ? convertFileSrc(`${config.archive_path}/${image.file_path}`)
          : '';

        return (
          <div 
            key={image.id}
            onClick={() => selectImage(image)}
            className="relative bg-[#E8F3FB] border border-[rgba(0,45,88,0.15)] rounded-md overflow-hidden cursor-pointer hover:ring-2 hover:ring-[#0084C5] transition-all aspect-square"
          >
            {imageUrl && (
              <img 
                src={imageUrl} 
                alt={image.filename}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            )}
            {!image.has_exif && (
              <div className="absolute top-1 right-1 w-[7px] h-[7px] rounded-full bg-[#E6A817]" title="Missing EXIF date" />
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-[rgba(0,45,88,0.6)] p-1">
              <p className="text-[10px] text-white truncate">{image.filename}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}