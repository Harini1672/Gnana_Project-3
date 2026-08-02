import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle, Info, X, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextType {
  toast: (type: ToastType, title: string, description?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((type: ToastType, title: string, description?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, description }]);
    
    // Auto dismiss after 4 seconds
    setTimeout(() => {
      dismiss(id);
    }, 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      
      {/* Toast Portal Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-3 p-4 rounded-xl border glass-panel shadow-lg transition-all duration-300 transform translate-y-0 scale-100 ${
              t.type === 'success' ? 'border-emerald-500/20 bg-emerald-50/90 dark:bg-emerald-950/20' :
              t.type === 'error' ? 'border-rose-500/20 bg-rose-50/90 dark:bg-rose-950/20' :
              t.type === 'warning' ? 'border-amber-500/20 bg-amber-50/90 dark:bg-amber-950/20' :
              'border-indigo-500/20 bg-indigo-50/90 dark:bg-indigo-950/20'
            }`}
          >
            {t.type === 'success' && <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />}
            {t.type === 'error' && <XCircle className="h-5 w-5 text-rose-500 shrink-0" />}
            {t.type === 'warning' && <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />}
            {t.type === 'info' && <Info className="h-5 w-5 text-indigo-500 shrink-0" />}
            
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {t.title}
              </h4>
              {t.description && (
                <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">
                  {t.description}
                </p>
              )}
            </div>

            <button
              onClick={() => dismiss(t.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
