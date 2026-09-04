import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDialogStore } from '@/stores/use-dialog-store';

export function GlobalDialog() {
  const { isOpen, config, close } = useDialogStore();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent
        showCloseButton={config?.showCloseButton ?? true}
        className="max-w-6xl max-h-screen overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{config?.title}</DialogTitle>
        </DialogHeader>
        {config?.content}
        {config?.footer && (
          <DialogFooter>{config.footer}</DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
