import { FolderOpen, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function DraftDestinationDialog({ open, onOpenChange, onChoose, onCloseComplete }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (destination: 'local' | 'hackmd') => void;
  onCloseComplete: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} onOpenChangeComplete={open => { if (!open) onCloseComplete(); }}>
      <DialogContent size="sm" aria-describedby={undefined} finalFocus={false}>
        <DialogHeader><DialogTitle>Save note</DialogTitle></DialogHeader>
        <Button variant="secondary" onClick={() => onChoose('local')}><FolderOpen aria-hidden="true" className="h-4 w-4" />Local Vault</Button>
        <Button variant="secondary" onClick={() => onChoose('hackmd')}><Cloud aria-hidden="true" className="h-4 w-4" />HackMD</Button>
      </DialogContent>
    </Dialog>
  );
}
