import { Bar, BarChart, LabelList, Rectangle, ReferenceLine, XAxis, YAxis, type BarShapeProps } from "recharts";
import { THEME } from "@shared/palette.ts";
import { formatPoints } from "@shared/rules.ts";
import { Card } from "../../components/ui/index.ts";
import { useReducedMotion } from "../../lib/useReducedMotion.ts";
import { useElementWidth } from "./useElementWidth.ts";

export interface PointsChartRow {
  id: number;
  name: string;
  points: number;
}

const ROW_HEIGHT = 28;
const AXIS_FONT = 16;
const NAME_LIMIT = 16;
const ZERO_LINE = "#A9D8BA"; // --color-line-deep

function shortName(name: string): string {
  return name.length > NAME_LIMIT ? `${name.slice(0, NAME_LIMIT - 1)}…` : name;
}

interface ValueLabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: unknown;
}

/** The total at the end of each bar: right of a positive bar, left of a negative one. */
function ValueLabel({ x = 0, y = 0, width = 0, height = 0, value }: ValueLabelProps) {
  const [left, w, top, h] = [Number(x), Number(width), Number(y), Number(height)];
  const points = Number(value);
  const negative = points < 0;
  const edge = negative ? Math.min(left, left + w) : Math.max(left, left + w);
  return (
    <text
      x={edge + (negative ? -6 : 6)}
      y={top + h / 2}
      dy="0.35em"
      textAnchor={negative ? "end" : "start"}
      fontSize={AXIS_FONT}
      fontWeight={700}
      fill={THEME.ink}
      className="font-display"
    >
      {formatPoints(points)}
    </text>
  );
}

function PointsBar(props: BarShapeProps) {
  const negative = Number(props.value) < 0;
  return <Rectangle {...props} fill={negative ? THEME.coral : THEME.leaf} radius={[0, 8, 8, 0]} />;
}

/** Horizontal bars of each student's total points: leaf for positive, coral for negative (spec §8.5). */
export function PointsChart({ rows }: { rows: readonly PointsChartRow[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const reduced = useReducedMotion() ?? false;
  const height = rows.length * ROW_HEIGHT + 40;

  const data = rows.map((r) => ({ ...r, label: shortName(r.name) }));
  const lo = Math.min(0, ...rows.map((r) => r.points));
  const hi = Math.max(0, ...rows.map((r) => r.points));
  const pad = Math.max(1, (hi - lo) * 0.14);
  const domain: [number, number] = [lo < 0 ? lo - pad : 0, hi + pad];
  const longest = Math.max(...data.map((d) => d.label.length), 3);
  const nameWidth = Math.min(190, longest * 10 + 18);
  const summary = rows.map((r) => `${r.name} ${formatPoints(r.points)}`).join(", ");

  return (
    <Card data-print-flat data-print-keep className="flex flex-col print:break-before-page">
      <h2 id="points-chart-title" className="text-[1.75rem]">
        Points per student
      </h2>
      <div
        ref={ref}
        role="img"
        aria-label={`Bar chart of total points per student: ${summary}.`}
        data-chart
        className="mt-3 w-full"
        style={{ height }}
      >
        {width > 0 && (
          <BarChart
            width={width}
            height={height}
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
            barCategoryGap={5}
            accessibilityLayer={false}
          >
            <XAxis type="number" hide domain={domain} allowDataOverflow />
            <YAxis
              type="category"
              dataKey="label"
              width={nameWidth}
              interval={0}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: AXIS_FONT, fontWeight: 700, fill: THEME.ink }}
            />
            <ReferenceLine x={0} stroke={ZERO_LINE} strokeWidth={2} />
            <Bar dataKey="points" shape={PointsBar} isAnimationActive={!reduced} animationDuration={600}>
              <LabelList dataKey="points" content={ValueLabel} />
            </Bar>
          </BarChart>
        )}
      </div>
    </Card>
  );
}
