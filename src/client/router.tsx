import { createBrowserRouter } from "react-router";
import { AppShell, RequireAuth, RouteError } from "./components/layout/index.ts";
import { LoginPage } from "./features/auth/LoginPage.tsx";
import { ResetPage } from "./features/auth/ResetPage.tsx";
import { SetupPage } from "./features/auth/SetupPage.tsx";
import { AdminPage, CalendarPage, DayPage, ReportsPage, StudentReportPage } from "./pages.ts";

export const router = createBrowserRouter([
  {
    path: "/",
    errorElement: <RouteError />,
    children: [
      { path: "setup", element: <SetupPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "reset", element: <ResetPage /> },
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
