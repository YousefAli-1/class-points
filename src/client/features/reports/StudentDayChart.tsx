import { format } from "date-fns";
import { Bar, BarChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { parseISODate } from "@shared/dates.ts";
import { COLORS, THEME } from "@shared/palette.ts";
import type { StudentReport } from "@shared/report.ts";
import { formatPoints } from "@shared/rules.ts";
import type { Subject } from "@shared/types.ts";
import { useReducedMotion } from "../../lib/useReducedMotion.ts";
import { useElementWidth } from "./useElementWidth.ts";

const HEIGHT = 300;
const MUTED = "#4E6357"; // --color-muted
const ZERO_LINE = "#A9D8BA"; // --color-line-deep

interface DayDatum {
  date: string;
  label: string;
  total: number;
  [series: `s${number}`]: number | undefined;
}

interface TickProps {
  x?: number | string;
  y?: number | string;
  index?: number;
}

/** The day under each stack, with its total below in bold. */
function DayTick({ x = 0, y = 0, datum }: TickProps & { datum: DayDatum | undefined }) {
  if (!datum) return null;
  return (
    <g transform={`translate(${Number(x)},${Number(y)})`}>
      <text textAnchor="middle" dy="1em" fontSize={14} fontWeight={700} fill={MUTED}>
        {datum.label}
      </text>
      <text textAnchor="middle" dy="2.3em" fontSize={16} fontWeight={700} fill={THEME.ink} className="font-display">
        {formatPoints(datum.total)}
      </text>
    </g>
  );
}

export interface StudentDayChartProps {
  perDay: StudentReport["perDay"];
  /** The subjects that appear, in order: one stacked series each, in the subject's colour. */
  subjects: readonly Subject[];
}

/** Points per day, stacked by subject (spec §8.5). The day's total sits under its label. */
export function StudentDayChart({ perDay, subjects }: StudentDayChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const reduced = useReducedMotion() ?? false;
  const many = perDay.length > 10;

  const data: DayDatum[] = perDay.map((d) => {
    const datum: DayDatum = {
      date: d.date,
      label: format(parseISODate(d.date), many ? "d" : "EEE d"),
      total: d.total,
    };
    for (const s of subjects) datum[`s${s.id}`] = d.bySubject[s.id];
    return datum;
  });
  const summary = perDay
    .map((d) => `${format(parseISODate(d.date), "EEE d MMM")} ${formatPoints(d.total)}`)
    .join(", ");

  const renderTick = (props: TickProps) => <DayTick {...props} datum={data[props.index ?? 0]} />;

  return (
    <div>
      <ul aria-label="Chart key" className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {subjects.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5 text-base font-bold text-ink">
            <span aria-hidden="true" className="size-4 rounded-md" style={{ backgroundColor: COLORS[s.color].ring }} />
            {s.name}
          </li>
        ))}
      </ul>
      <div
        ref={ref}
        role="img"
        aria-label={`Bar chart of points per day: ${summary}.`}
        data-chart
        className="w-full"
        style={{ height: HEIGHT }}
      >
        {width > 0 && (
          <BarChart
            width={width}
            height={HEIGHT}
            data={data}
            stackOffset="sign"
            margin={{ top: 8, right: 4, bottom: 4, left: -12 }}
            barCategoryGap="22%"
            accessibilityLayer={false}
          >
            <XAxis
              dataKey="date"
              tick={renderTick}
              interval={0}
              height={48}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fontSize: 14, fill: MUTED, fontWeight: 700 }}
            />
            <ReferenceLine y={0} stroke={ZERO_LINE} strokeWidth={2} />
            <Tooltip
              cursor={{ fill: THEME.mint }}
              labelFormatter={(date) => format(parseISODate(String(date)), "EEEE d MMMM")}
              formatter={(value) => formatPoints(Number(value))}
              contentStyle={{ borderRadius: 16, border: "1px solid #CBE7D5", fontWeight: 700 }}
            />
            {subjects.map((s) => (
              <Bar
                key={s.id}
                dataKey={`s${s.id}`}
                name={s.name}
                stackId="day"
                fill={COLORS[s.color].ring}
                maxBarSize={64}
                isAnimationActive={!reduced}
                animationDuration={600}
              />
            ))}
          </BarChart>
        )}
      </div>
    </div>
  );
}
