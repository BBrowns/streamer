import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  actionLabel?: string;
  onAction?: () => void | Promise<unknown>;
  duration?: number;
}

export interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void | Promise<unknown>;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string, type?: ToastType, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (message, type = "info", options = {}) => {
    const id = Math.random().toString(36).slice(2);
    const duration = options.duration ?? (options.onAction ? 7000 : 3500);
    set((s) => ({
      toasts: [...s.toasts, { id, message, type, ...options, duration }],
    }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
