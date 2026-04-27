import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { registerApiToastHandlers } from '../utils/api.js';

const ToastContext = createContext(null);

const TOAST_ICON_BY_TYPE = {
  success: CheckCircle2,
  error: CircleAlert,
  info: Info,
};

function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => {
        const Icon = TOAST_ICON_BY_TYPE[toast.type] || Info;

        return (
          <div key={toast.id} className={`toast-card toast-card--${toast.type}`}>
            <div className="toast-card__body">
              <Icon size={18} className="toast-card__icon" />
              <p className="toast-card__message">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="toast-card__close"
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((message, type = 'info', duration = 3600) => {
    const id = nextId.current + 1;
    nextId.current = id;

    setToasts((current) => [...current, { id, message, type }]);

    window.setTimeout(() => {
      dismiss(id);
    }, duration);

    return id;
  }, [dismiss]);

  const toastApi = useMemo(() => ({
    success(message, duration) {
      return push(message, 'success', duration);
    },
    error(message, duration) {
      return push(message, 'error', duration);
    },
    info(message, duration) {
      return push(message, 'info', duration);
    },
    dismiss,
  }), [dismiss, push]);

  useEffect(() => {
    registerApiToastHandlers(toastApi);
    return () => registerApiToastHandlers(null);
  }, [toastApi]);

  return (
    <ToastContext.Provider value={toastApi}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return context;
}
