// This file re-exports from sonner for backwards compatibility
// The project primarily uses 'sonner' for toast notifications
export { toast } from 'sonner';

// Placeholder for compatibility - not actively used
export const useToast = () => ({
  toasts: [],
  toast: () => {},
  dismiss: () => {},
});
