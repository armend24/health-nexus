/**
 * Lightweight localStorage store that remembers appointments the patient has booked.
 * This avoids the need for a dedicated "list my appointments" backend endpoint —
 * the existing PATCH /reschedule and PATCH /cancel endpoints handle edits.
 */

const STORAGE_KEY = 'health-nexus.myAppointments';

export interface SavedAppointment {
  id: string;
  appointment_datetime: string; // naive ISO e.g. "2026-03-10T09:00:00"
  status: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  doctor_id: string;
  tenant_id: string;
  bookedAt: string; // ISO timestamp of when it was stored
}

function read(): SavedAppointment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedAppointment[];
  } catch {
    return [];
  }
}

function write(appointments: SavedAppointment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments));
}

/** Add or update an appointment in the local list */
export function saveAppointment(appt: SavedAppointment) {
  const list = read();
  const idx = list.findIndex((a) => a.id === appt.id);
  if (idx >= 0) {
    list[idx] = appt;
  } else {
    list.unshift(appt); // newest first
  }
  write(list);
}

/** Update just the status of a stored appointment */
export function updateAppointmentStatus(
  id: string,
  status: SavedAppointment['status']
) {
  const list = read();
  const item = list.find((a) => a.id === id);
  if (item) {
    item.status = status;
    write(list);
  }
}

/** Update the datetime when rescheduling */
export function updateAppointmentDatetime(
  id: string,
  datetime: string
) {
  const list = read();
  const item = list.find((a) => a.id === id);
  if (item) {
    item.appointment_datetime = datetime;
    item.status = 'REQUESTED'; // reschedule resets to REQUESTED
    write(list);
  }
}

/** Get all saved appointments (newest first) */
export function getMyAppointments(): SavedAppointment[] {
  return read();
}

/** Get a single appointment by ID */
export function getAppointment(
  id: string
): SavedAppointment | undefined {
  return read().find((a) => a.id === id);
}
