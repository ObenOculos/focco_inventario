// The project uses Sonner for toast notifications
// This component exists for backwards compatibility but is not actively used
// See src/components/ui/sonner.tsx for the actual toast implementation

import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return <SonnerToaster />;
}
