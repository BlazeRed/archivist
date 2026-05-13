import { useTranslation } from 'react-i18next';
import { useTimelineStore } from '../stores/timelineStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useAppConfigStore } from '../stores/appConfigStore';

export function ImageDetail() {
  const { t } = useTranslation();
  const { selectedImage, selectImage } = useTimelineStore();
  const { config } = useAppConfigStore();

  if (!selectedImage) return null;

  const imageUrl = config.archive_path 
    ? convertFileSrc(`${config.archive_path}/${selectedImage.file_path}`)
    : '';

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t('import.missingDate');
    return new Date(dateStr).toLocaleDateString();
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => selectImage(null)}>
      <div 
        className="bg-[#E8F3FB] rounded-xl max-w-4xl max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex">
          {/* Image */}
          <div className="flex-1 bg-[#002D58] flex items-center justify-center p-4">
            {imageUrl && (
              <img 
                src={imageUrl} 
                alt={selectedImage.filename}
                className="max-w-full max-h-[60vh] object-contain"
              />
            )}
          </div>
          
          {/* Details panel */}
          <div className="w-72 p-4 bg-[#E8F3FB]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-[#002D58]">Details</h3>
              <button 
                onClick={() => selectImage(null)}
                className="text-[#002D58] hover:text-[#0084C5]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-[rgba(0,45,88,0.45)] text-xs">Filename</p>
                <p className="text-[#002D58] truncate">{selectedImage.filename}</p>
              </div>
              
              <div>
                <p className="text-[rgba(0,45,88,0.45)] text-xs">Date Taken</p>
                <p className="text-[#002D58]">
                  {formatDate(selectedImage.taken_at)}
                  {!selectedImage.has_exif && (
                    <span className="ml-2 text-[10px] bg-[rgba(230,168,23,0.15)] text-[#A87B0A] px-1 rounded">
                      {t('import.noDate')}
                    </span>
                  )}
                </p>
              </div>
              
              <div>
                <p className="text-[rgba(0,45,88,0.45)] text-xs">Imported</p>
                <p className="text-[#002D58]">{formatDate(selectedImage.imported_at)}</p>
              </div>
              
              {selectedImage.width && selectedImage.height && (
                <div>
                  <p className="text-[rgba(0,45,88,0.45)] text-xs">Dimensions</p>
                  <p className="text-[#002D58]">{selectedImage.width} × {selectedImage.height}</p>
                </div>
              )}
              
              {selectedImage.file_size && (
                <div>
                  <p className="text-[rgba(0,45,88,0.45)] text-xs">File Size</p>
                  <p className="text-[#002D58]">{formatSize(selectedImage.file_size)}</p>
                </div>
              )}
              
              <div>
                <p className="text-[rgba(0,45,88,0.45)] text-xs">ID</p>
                <p className="text-[#002D58] text-xs font-mono truncate" title={selectedImage.id}>
                  {selectedImage.id.substring(0, 16)}...
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}