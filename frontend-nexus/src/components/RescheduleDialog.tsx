import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDoctorAvailability } from '@/services/appointments.queries';
import { format } from 'date-fns';
import { useState } from 'react';

interface RescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  onReschedule: (naiveDatetime: string) => Promise<void>;
  isPending: boolean;
}

export function RescheduleDialog({
  open,
  onOpenChange,
  doctorId,
  onReschedule,
  isPending,
}: RescheduleDialogProps) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const formattedDate = date ? format(date, 'yyyy-MM-dd') : '';
  const {
    data: availability,
    isLoading,
    isError,
    error,
  } = useDoctorAvailability(doctorId, formattedDate);

  /** Build naive ISO string e.g. "2026-03-10T09:00:00" — no timezone info */
  const buildNaiveDatetime = (slotTime: string): string => {
    return `${formattedDate}T${slotTime}:00`;
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule Appointment</DialogTitle>
          <DialogDescription>
            Select a new date and time slot for your appointment.
          </DialogDescription>
        </DialogHeader>
        <div>
          <span className="font-medium">Select a date:</span>
          <div className="mt-2">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              disabled={(d: Date) => d < today}
            />
          </div>
        </div>
        {date && (
          <div>
            <span className="font-medium">Available time slots:</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {isLoading && <span>Loading...</span>}
              {isError && (
                <span className="text-destructive">
                  {(error as Error)?.message ||
                    'Error loading availability'}
                </span>
              )}
              {!isLoading &&
                !isError &&
                availability &&
                availability.slots.length === 0 && (
                  <span>No slots available for this date.</span>
                )}
              {!isLoading &&
                !isError &&
                availability &&
                availability.slots.length > 0 &&
                availability.slots.map((slot) => {
                  const naiveDt = buildNaiveDatetime(slot.time);
                  const slotDate = new Date(date);
                  const [h, m] = slot.time.split(':').map(Number);
                  slotDate.setHours(h, m, 0, 0);
                  const isPast = slotDate < new Date();
                  return (
                    <Button
                      key={slot.time}
                      variant={slot.available ? 'default' : 'outline'}
                      disabled={
                        !slot.available || isPending || isPast
                      }
                      type="button"
                      className="min-w-[90px]"
                      onClick={() => {
                        if (!slot.available || isPending || isPast)
                          return;
                        onReschedule(naiveDt);
                      }}
                    >
                      {slot.time}
                    </Button>
                  );
                })}
            </div>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
