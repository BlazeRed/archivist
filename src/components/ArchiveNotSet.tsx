import { useTranslation } from 'react-i18next';
import { pickAndOpenArchive } from '@/lib/openArchive';
import { Button } from '@/components/ui/button';

/** Empty page shown while no archive is set (Favourites, Groups, Trash): message + Open archive. */
export function ArchiveNotSet() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center h-[calc(100vh-var(--topbar-offset))]">
      <div className="squircle bg-card px-8 py-6 rounded-xl text-center max-w-sm">
        <p className="text-muted-foreground text-sm mb-4">{t('timeline.archiveNotSet')}</p>
        <Button onClick={() => pickAndOpenArchive()}>{t('timeline.openArchive')}</Button>
      </div>
    </div>
  );
}
