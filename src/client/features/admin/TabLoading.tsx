import { Spinner } from "../../components/ui/Spinner.tsx";

/** While the class data loads. */
export function TabLoading() {
  return (
    <div role="status" className="flex min-h-64 items-center justify-center text-leaf-deep">
      <Spinner size={30} />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
