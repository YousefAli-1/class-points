import { lazy } from "react";

// Feature pages load on demand: the login screen doesn't pay for charts and drag-and-drop.
// Each feature file default-exports its page.

export const CalendarPage = lazy(() => import("./features/calendar/CalendarPage.tsx"));
export const DayPage = lazy(() => import("./features/day/DayPage.tsx"));
export const ReportsPage = lazy(() => import("./features/reports/ReportsPage.tsx"));
export const StudentReportPage = lazy(() => import("./features/reports/StudentReportPage.tsx"));
export const AdminPage = lazy(() => import("./features/admin/AdminPage.tsx"));
