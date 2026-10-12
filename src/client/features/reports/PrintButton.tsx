import { Button } from "../../components/ui/index.ts";

/** The screen-only Print button both report pages share. */
export function PrintButton() {
  return (
    <Button variant="secondary" icon={<span aria-hidden="true">🖨️</span>} className="ml-auto" onClick={() => window.print()}>
      Print
    </Button>
  );
}
