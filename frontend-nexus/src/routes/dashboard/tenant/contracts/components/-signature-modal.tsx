import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { contractsService } from '@/services/contracts.service';
import { useDialogStore } from '@/stores/use-dialog-store';

const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 140;

interface SignatureModalContentProps {
  contractId: number;
  role: 'doctor' | 'hospital';
}

export function SignatureModalContent({
  contractId,
  role,
}: SignatureModalContentProps) {
  const { close } = useDialogStore();
  const queryClient = useQueryClient();
  const canvasRef = React.useRef<SignatureCanvas | null>(null);
  const description =
    role === 'doctor'
      ? "Draw the doctor's signature below, then click Save. Only the assigned doctor can sign."
      : 'Draw the hospital/tenant manager signature below, then click Save.';
  const signMutation = useMutation({
    mutationFn: async (file: File) => {
      if (role === 'doctor') {
        return contractsService.signDoctor(contractId, file);
      }
      return contractsService.signHospital(contractId, file);
    },
    onSuccess: () => {
      const actorLabel = role === 'doctor' ? 'Doctor' : 'Hospital';
      toast.success(
        `${actorLabel} signature uploaded for contract #${contractId}.`
      );
      void queryClient.invalidateQueries({
        queryKey: ['tenant-contracts'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['contract-detail', contractId],
      });
      canvasRef.current?.clear();
      close();
    },
    onError: (error) => {
      const actorLabel = role === 'doctor' ? 'doctor' : 'hospital';
      toast.error(`Unable to upload ${actorLabel} signature.`, {
        description: (error as Error).message,
      });
    },
  });
  const isSubmitting = signMutation.isPending;

  const handleClear = () => {
    canvasRef.current?.clear();
  };

  const handleSave = async () => {
    const pad = canvasRef.current;
    if (!pad) return;
    if (pad.isEmpty()) {
      toast.error('Please draw your signature first.');
      return;
    }

    const canvas = pad.getCanvas();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const file = new File([blob], `signature_${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });

    try {
      await signMutation.mutateAsync(file);
    } catch {
      // Error is handled in mutation onError.
    }
  };

  return (
    <>
      <p className="text-sm text-muted-foreground">{description}</p>

      <div className="space-y-3">
        <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-lg border-2 border-input bg-white shadow-sm touch-none">
          <SignatureCanvas
            ref={canvasRef}
            canvasProps={{
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              className: 'block touch-none select-none',
              style: {
                display: 'block',
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
              },
            }}
            penColor="#1a1a1a"
            backgroundColor="white"
            clearOnResize={false}
            minWidth={1}
            maxWidth={2.5}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-6 border-b-2 border-dashed border-muted-foreground/50"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute bottom-2 left-3 text-xs font-medium text-muted-foreground"
            aria-hidden
          >
            Sign here
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Draw your signature above using a mouse or touch. Clear to
          redraw.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={close}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleClear}
          disabled={isSubmitting}
        >
          Clear
        </Button>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSubmitting}
          loading={isSubmitting}
        >
          Save signature
        </Button>
      </div>
    </>
  );
}
