import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router";
import { AppShell, CenteredScreen, RequireAuth, RouteError } from "./components/layout/index.ts";
import { Spinner } from "./components/ui/Spinner.tsx";
import { LoginPage } from "./features/auth/LoginPage.tsx";
import { AdminPage, CalendarPage, DayPage, ReportsPage, StudentReportPage } from "./pages.ts";

// Login is the everyday entry, so it ships in the main bundle. Setup and reset are rare: they load
// on demand, like the feature pages. (This file exports the router, so it is never a Fast Refresh
// boundary: the rule below has nothing to protect here.)
/* eslint-disable react-refresh/only-export-components */
const SetupPage = lazy(() => import("./features/auth/SetupPage.tsx").then((m) => ({ default: m.SetupPage })));
const ResetPage = lazy(() => import("./features/auth/ResetPage.tsx").then((m) => ({ default: m.ResetPage })));
/* eslint-enable react-refresh/only-export-components */

/** Auth pages sit outside the app shell, so they bring their own loading screen. */
const authLoading = (
  <CenteredScreen>
    <span className="text-leaf-deep">
      <Spinner size={36} />
    </span>
  </CenteredScreen>
);

export const router = createBrowserRouter([
  {
    path: "/",
    errorElement: <RouteError />,
    children: [
      {
        path: "setup",
        element: (
          <Suspense fallback={authLoading}>
            <SetupPage />
          </Suspense>
        ),
      },
      { path: "login", element: <LoginPage /> },
      {
        path: "reset",
        element: (
          <Suspense fallback={authLoading}>
            <ResetPage />
          </Suspense>
        ),
      },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          {
            // A page that throws shows the error inside the shell, so the top bar stays usable.
            errorElement: <RouteError />,
            children: [
              { index: true, element: <CalendarPage /> },
              { path: "day/:date", element: <DayPage /> },
              { path: "reports", element: <ReportsPage /> },
              { path: "reports/student/:id", element: <StudentReportPage /> },
              { path: "admin/*", element: <AdminPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
