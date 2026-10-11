import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuthStatus } from "../../lib/queries.ts";
import { Mascot } from "../Mascot.tsx";
import { Button } from "../ui/Button.tsx";
import { Spinner } from "../ui/Spinner.tsx";
import { CenteredScreen } from "./CenteredScreen.tsx";

/** Where the login page sends her back to. */
export interface LoginRedirectState {
  from?: string;
}

/** Shows `children` only to a logged-in teacher: no teacher yet → /setup, logged out → /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isError, isFetching, refetch } = useAuthStatus();
  const location = useLocation();

  // Keep showing the app with the last known status when a re-check fails (e.g. offline).
  if (data) {
    if (!data.setupDone) return <Navigate to="/setup" replace />;
    if (!data.loggedIn) {
      const state: LoginRedirectState = { from: location.pathname + location.search };
      return <Navigate to="/login" replace state={state} />;
    }
    return <>{children}</>;
  }

  if (isError) {
    return (
      <CenteredScreen>
        <Mascot mood="think" size={128} />
        <h1 className="mt-4 text-center text-3xl">Can&rsquo;t reach Class Points</h1>
        <p className="mt-2 max-w-sm text-center text-lg text-muted">Check the internet connection, then try again.</p>
        <Button className="mt-6" size="lg" loading={isFetching} onClick={() => void refetch()}>
          Try again
        </Button>
      </CenteredScreen>
    );
  }

  return (
    <CenteredScreen>
      <Mascot mood="happy" size={112} />
      <span className="mt-4 text-leaf-deep">
        <Spinner size={32} />
      </span>
    </CenteredScreen>
  );
}
