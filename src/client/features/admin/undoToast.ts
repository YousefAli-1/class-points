import { toast } from "sonner";

/** Twice sonner's default: long enough to read the message and reach the button. */
export const UNDO_TOAST_MS = 8000;

/** "… moved to Removed …" with an Undo button: the quick way back from a mistaken Remove. */
export function undoToast(message: string, undo: () => void): void {
  toast(message, { duration: UNDO_TOAST_MS, action: { label: "Undo", onClick: undo } });
}
