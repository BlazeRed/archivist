import { useTranslation } from 'react-i18next';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function useMonthNames(): string[] {
  const { t } = useTranslation();
  return Array.from({ length: 12 }, (_, i) => t(`months.${i + 1}`));
}
