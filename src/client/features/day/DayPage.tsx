import { useParams } from "react-router";
import { formatLongDate, isValidISODate } from "@shared/dates.ts";
import { Card } from "../../components/ui/Card.tsx";
import { EmptyState } from "../../components/ui/EmptyState.tsx";

/** Placeholder: Task 7 builds the day view (spec §8.4). */
export default function DayPage() {
  const { date = "" } = useParams();
  const when = isValidISODate(date) ? formatLongDate(date) : null;
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-4xl">{when ? when.weekday : "Day"}</h1>
      {when && <p className="-mt-3 text-lg text-muted">{when.full}</p>}
      <Card>
        <EmptyState mood="think" title="The day view is on its way" />
      </Card>
    </section>
  );
}
