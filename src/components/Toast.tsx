import { useNotificationStore, Notification } from '../stores/notificationStore';

const typeStyles = {
  success: { bg: '#002D58', dot: '#2A9EAD' },
  warning: { bg: '#002D58', dot: '#E6A817' },
  error: { bg: '#002D58', dot: '#E24B4A' },
  info: { bg: '#002D58', dot: '#0084C5' },
};

function Toast({ notification, onClose }: { notification: Notification; onClose: () => void }) {
  const styles = typeStyles[notification.type];
  
  return (
    <div 
      className="flex items-center gap-3 px-4 py-3 rounded-lg min-w-[280px] max-w-sm"
      style={{ backgroundColor: styles.bg }}
    >
      <div 
        className="w-[7px] h-[7px] rounded-full flex-shrink-0"
        style={{ backgroundColor: styles.dot }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[#D2E8F7]">{notification.title}</p>
        <p className="text-xs text-[#D2E8F7] opacity-70 truncate">{notification.message}</p>
      </div>
      <button 
        onClick={onClose}
        className="text-[#D2E8F7] opacity-50 hover:opacity-100"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { notifications, removeNotification } = useNotificationStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {notifications.map((notification) => (
        <Toast 
          key={notification.id} 
          notification={notification} 
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
}