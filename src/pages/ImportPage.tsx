import { useTranslation } from 'react-i18next';

export function ImportPage() {
  const { t } = useTranslation();
  return (
    <div className="p-6">
      <h1 className="text-[22px] font-medium text-[#002D58] mb-4">{t('import.title')}</h1>
      <p className="text-[#002D58] opacity-55">{t('import.selectSource')}</p>
    </div>
  );
}