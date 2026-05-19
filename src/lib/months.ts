import { useTranslation } from 'react-i18next';

export function useMonthNames(): string[] {
  const { t } = useTranslation();
  return Array.from({ length: 12 }, (_, i) => t(`months.${i + 1}`));
}
