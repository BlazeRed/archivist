import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useTimelineStore } from '../stores/timelineStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { ImageMetadata } from './ImageMetadata';
import { cn } from '@/lib/utils';

export function ImageDetail({ hideGroups, hideDetails }: { hideGroups?: boolean; hideDetails?: boolean }) {
  const { t } = useTranslation();
  const { selectedImage, selectImage } = useTimelineStore();
  const { config } = useAppConfigStore();

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgSrc, setImgSrc] = useState('');

  const archivePath = config.archive_path.replace(/\/+$/, '');

  useEffect(() => {
    if (!selectedImage) { setImgSrc(''); return; }
    setImageLoaded(false);
    setImgSrc('');
    const url = archivePath
      ? convertFileSrc(`${archivePath}/${selectedImage.file_path}`)
      : '';
    const id = requestAnimationFrame(() => setImgSrc(url));
    return () => cancelAnimationFrame(id);
  }, [selectedImage, archivePath]);

  if (!selectedImage) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={() => selectImage(null)}
    >
      <div
        className={cn(
          'bg-[#E8F3FB] rounded-xl w-full max-h-[90vh] flex overflow-hidden',
          hideDetails ? 'max-w-3xl' : 'max-w-5xl'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        <div className="flex-1 bg-[#001A36] flex items-center justify-center p-4 min-w-0 relative">
          {(!imgSrc || !imageLoaded) && (
            <svg className="animate-spin size-8 text-white/40" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          )}
          <img
            src={imgSrc}
            alt={selectedImage.filename}
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            className={`max-w-full max-h-[80vh] object-contain transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0 absolute'}`}
          />
          {hideDetails && (
            <button
              onClick={() => selectImage(null)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
              title={t('common.close')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Details panel — hidden when hideDetails=true */}
        {!hideDetails && (
          <div className="w-72 flex flex-col bg-[#E8F3FB] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-3 border-b border-[rgba(0,45,88,0.12)]">
              <h3 className="text-sm font-semibold text-[#002D58]">{t('detail.title')}</h3>
              <button
                onClick={() => selectImage(null)}
                className="text-[rgba(0,45,88,0.55)] hover:text-[#0084C5] transition-colors"
                title={t('common.close')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Metadata + groups */}
            <div className="px-4 py-3 flex-1 overflow-y-auto">
              <ImageMetadata image={selectedImage} hideGroups={hideGroups} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

