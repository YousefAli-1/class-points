import { Button, Card, EmptyState, Spinner } from "../../components/ui/index.ts";

/** While the first report loads. */
export function ReportLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-[40dvh] items-center justify-center text-leaf-deep">
      <Spinner size={34} />
    </div>
  );
}

/** The report couldn't be fetched (the global handler has already shown a toast). */
export function ReportLoadError({ onRetry }: { onRetry(): void }) {
  return (
    <Card>
      <EmptyState mood="think" title="We couldn’t load this report" action={<Button onClick={onRetry}>Try again</Button>}>
        Check the connection and try again.
      </EmptyState>
    </Card>
  );
}
