import { Card } from "../../components/ui/Card.tsx";
import { EmptyState } from "../../components/ui/EmptyState.tsx";

/** Placeholder: Task 9 builds the class report (spec §8.5). */
export default function ReportsPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-4xl">Reports</h1>
      <Card>
        <EmptyState mood="cheer" title="Reports are on their way" />
      </Card>
    </section>
  );
}
