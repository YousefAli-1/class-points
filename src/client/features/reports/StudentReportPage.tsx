import { Card } from "../../components/ui/Card.tsx";
import { EmptyState } from "../../components/ui/EmptyState.tsx";

/** Placeholder: Task 9 builds the per-student report (spec §8.5). */
export default function StudentReportPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-4xl">Student report</h1>
      <Card>
        <EmptyState mood="happy" title="Student reports are on their way" />
      </Card>
    </section>
  );
}
