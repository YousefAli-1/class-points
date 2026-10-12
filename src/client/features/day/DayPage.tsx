import { useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { isValidISODate } from "@shared/dates.ts";
import type { ISODate } from "@shared/types.ts";
import { Mascot } from "../../components/Mascot.tsx";
import { BUTTON_VARIANTS, Button, Card, EmptyState, Spinner } from "../../components/ui/index.ts";
import { celebrate } from "../../lib/confetti.ts";
import { useToday } from "../../lib/queries.ts";
import { useSound } from "../../lib/sound.ts";
import { DayFooter } from "./DayFooter.tsx";
import { DayHeader } from "./DayHeader.tsx";
import { StartLessonPanel } from "./StartLessonPanel.tsx";
import { StudentGrid } from "./StudentGrid.tsx";
import { useDayModel } from "./useDayModel.ts";

/** `/day/:date?subject=:id`: one lesson's student tiles (spec §8.4). Future or broken dates go home. */
export default function DayPage() {
  const { date = "" } = useParams();
  const today = useToday();
  if (!isValidISODate(date) || date > today) return <Navigate to="/" replace />;
  // A fresh view per date, so an entrance animation never leaks into the next day.
  return <DayView key={date} date={date} today={today} />;
}

const adminLink = (
  <Link to="/admin" className={`${BUTTON_VARIANTS.primary} inline-flex min-h-14 items-center rounded-btn px-6 font-display text-xl font-bold`}>
    Go to Admin
  </Link>
);

function DayView({ date, today }: { date: ISODate; today: ISODate }) {
  const model = useDayModel(date);
  const play = useSound();
  const [entrance, setEntrance] = useState(false);
  const subject = model.subjects.find((s) => s.id === model.subjectId);

  async function startLesson() {
    await model.startLesson();
    setEntrance(true);
    play("ding");
    celebrate("start");
  }

  function body() {
    if (model.failed) {
      return (
        <Card>
          <EmptyState mood="think" title="This day didn’t load" action={<Button onClick={model.retry}>Try again</Button>}>
            Check the internet connection, then try again.
          </EmptyState>
        </Card>
      );
    }
    if (!model.ready) {
      return (
        <div role="status" className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-leaf-deep">
          <Mascot mood="think" size={96} />
          <Spinner size={30} />
          <span className="sr-only">Loading the day…</span>
        </div>
      );
    }
    if (!subject) {
      return (
        <Card>
          <EmptyState mood="think" title="No subjects yet" action={adminLink}>
            Add a subject in Admin to start a lesson.
          </EmptyState>
        </Card>
      );
    }
    if (!model.lesson) {
      return (
        <StartLessonPanel
          key={subject.id}
          subject={subject}
          kind={model.kind}
          holidayLabel={model.holidayLabel}
          isToday={date === today}
          studentCount={model.students.length}
          onStart={startLesson}
        />
      );
    }
    if (model.students.length === 0) {
      return (
        <Card>
          <EmptyState mood="wave" title="No students on this day" action={adminLink}>
            Add your class in Admin and they’ll appear here.
          </EmptyState>
        </Card>
      );
    }
    return (
      <StudentGrid
        key={model.lesson.id}
        students={model.students}
        statusOf={model.statusOf}
        values={model.lesson}
        onAct={model.act}
        entrance={entrance}
      />
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <DayHeader
        date={date}
        today={today}
        subjects={model.subjects}
        subjectId={model.subjectId}
        onSubjectChange={(id) => {
          setEntrance(false);
          model.setSubjectId(id);
        }}
        startedSubjectIds={model.startedSubjectIds}
      />
      {body()}
      {/* Also with no students on the day, so a lesson started there by mistake can be cancelled. */}
      {model.lesson && subject && (
        <DayFooter counts={model.counts} subjectName={subject.name} onCancelLesson={model.cancelLesson} />
      )}
    </section>
  );
}
