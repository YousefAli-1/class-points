import { format } from "date-fns";

export interface PrintHeaderProps {
  className: string;
  periodLabel: string;
  /** e.g. the student's name on a student report. */
  title?: string;
  orientation: "landscape" | "portrait";
}

/**
 * Only on paper: class name, period and "Printed on …". It also sets the page size as a plain `@page`
 * rule for browsers without named-page support (print.css sets it per report with named pages).
 */
export function PrintHeader({ className, periodLabel, title, orientation }: PrintHeaderProps) {
  return (
    <>
      <style>{`@page { size: A4 ${orientation}; margin: 12mm; }`}</style>
      <header className="hidden border-b-2 border-line pb-2 print:flex print:items-end print:justify-between print:gap-4">
        <div>
          <p className="font-display text-2xl font-semibold text-forest">
            {className}
            {title && ` · ${title}`}
          </p>
          <p className="text-lg font-bold text-ink">{periodLabel}</p>
        </div>
        <p className="text-base text-muted">Printed on {format(new Date(), "d MMMM yyyy")}</p>
      </header>
    </>
  );
}
