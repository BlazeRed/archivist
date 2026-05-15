import { create } from 'zustand';
import { toast } from 'sonner';

export type NotificationType = 'success' | 'warning' | 'error' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
}

interface NotificationState {
  addNotification: (type: NotificationType, title: string, message: string) => void;
}

export const useNotificationStore = create<NotificationState>(() => ({
  addNotification: (type, title, message) => {
    const desc = message || undefined;
    if (type === 'success') toast.success(title, { description: desc });
    else if (type === 'warning') toast.warning(title, { description: desc });
    else if (type === 'error') toast.error(title, { description: desc });
    else toast.info(title, { description: desc });
  },
}));
