import { useEffect } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { RefreshIcon } from "../icons.tsx";
import { LeafBackdrop } from "./LeafBackdrop.tsx";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";

/** The friendly error screen for anything a page throws (and for unknown addresses). */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (!notFound) console.error(error);
  }, [error, notFound]);

  return (
    <div className="relative flex min-h-[80dvh] items-center justify-center px-safe py-8">
      <LeafBackdrop />
      <Card className="relative z-10 w-full max-w-lg">
        {notFound ? (
          <EmptyState
            mood="think"
            title="We can't find that page"
            action={
              <Button size="lg" onClick={() => window.location.assign("/")}>
                📅 Go to the calendar
              </Button>
            }
          >
            The address may be out of date. Let&rsquo;s head back to the calendar.
          </EmptyState>
        ) : (
          <EmptyState
            mood="think"
            title="Oops! Something went wrong"
            action={
              <Button size="lg" icon={<RefreshIcon />} onClick={() => window.location.reload()}>
                Reload
              </Button>
            }
          >
            Sprout tripped over a root. Reloading usually fixes it, and your saved marks are safe.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
