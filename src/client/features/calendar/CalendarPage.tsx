import { Card } from "../../components/ui/Card.tsx";
import { EmptyState } from "../../components/ui/EmptyState.tsx";

/** Placeholder: Task 6 builds the calendar (spec §8.3). */
export default function CalendarPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-4xl">Calendar</h1>
      <Card>
        <EmptyState mood="wave" title="The calendar is on its way">
          Soon you&rsquo;ll pick a day here and start a lesson.
        </EmptyState>
      </Card>
    </section>
  );
}
