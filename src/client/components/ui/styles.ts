// Class strings shared by several UI components (kept apart so the component files only export components).

export type ButtonVariant = "primary" | "secondary" | "sunny" | "danger" | "ghost";

/*
 * Colours of the chunky buttons, shared by Button and IconButton. White text on leaf (3.2:1) and
 * on honey (3.6:1) passes AA as large text only, so every button label is bold and at least 20px.
 * Red is kept for the cards (Global Constraints), so `danger` is amber.
 */
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "chunky bg-leaf text-white [--edge:var(--color-leaf-deep)] [text-shadow:0_1px_0_rgb(11_58_30/0.3)] hover:bg-[#27B062]",
  secondary: "chunky border-2 border-line bg-white text-forest [--edge:var(--color-line-deep)] hover:bg-sprout-soft",
  sunny: "chunky bg-sunshine text-ink [--edge:var(--color-sunshine-deep)] hover:bg-[#FFD955]",
  danger:
    "chunky bg-honey text-white [--edge:var(--color-honey-deep)] [text-shadow:0_1px_0_rgb(80_50_10/0.35)] hover:bg-[#C2832A]",
  ghost: "bg-transparent text-forest hover:bg-forest/8 active:bg-forest/12",
};

/** The dimmed backdrop behind dialogs. */
export const OVERLAY_CLASS = "fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px]";

/** A centred dialog panel (add a `max-w-*`). */
export const PANEL_CLASS = [
  "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
  "max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-blob bg-white p-6 shadow-pop sm:p-7",
  "focus-visible:outline-none",
].join(" ");

/** The look shared by text-like inputs (TextField, DateField, and textareas in feature forms). */
export const INPUT_CLASS = [
  "h-14 w-full min-w-0 rounded-2xl border-2 border-line bg-white px-4 text-lg text-ink",
  "placeholder:text-muted/70 transition-colors focus-visible:outline-none",
  "focus:border-leaf focus:ring-4 focus:ring-sprout/45",
  "aria-[invalid=true]:border-honey aria-[invalid=true]:focus:ring-sunshine/40",
  "disabled:bg-mist disabled:text-muted",
].join(" ");

/** `aria-describedby` for an input inside a `Field` with the same id, hint and error. */
export function describedBy(inputId: string, hint?: string, error?: string): string | undefined {
  return [hint && `${inputId}-hint`, error && `${inputId}-error`].filter(Boolean).join(" ") || undefined;
}
