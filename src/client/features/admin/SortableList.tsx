import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx.ts";

/** Rows only move up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

function GripIcon() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {[6, 12, 18].map((y) => (
        <g key={y}>
          <circle cx={9} cy={y} r={1.9} />
          <circle cx={15} cy={y} r={1.9} />
        </g>
      ))}
    </svg>
  );
}

interface SortableRowProps {
  id: number;
  label: string;
  children(handle: ReactNode): ReactNode;
}

function SortableRow({ id, label, children }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label={`Move ${label}`}
      title="Drag to reorder"
      className={cx(
        "inline-flex size-14 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-2xl",
        "text-muted/70 hover:bg-mint hover:text-forest active:cursor-grabbing",
        isDragging && "bg-mint text-forest",
      )}
      {...attributes}
      {...listeners}
    >
      <GripIcon />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx("relative", isDragging && "z-10 [&>*]:shadow-pop [&>*]:ring-2 [&>*]:ring-sprout")}
    >
      {children(handle)}
    </li>
  );
}

export interface SortableListProps<T extends { id: number }> {
  items: T[];
  /** Read out on each row's drag handle: "Move {label}". */
  labelOf(item: T): string;
  /** The new order, as ids. */
  onReorder(ids: number[]): void;
  /** One row; put `handle` where the grip should go. */
  renderItem(item: T, handle: ReactNode): ReactNode;
  className?: string;
}

/**
 * A list reordered by dragging each row's grip (dnd-kit). A finger has to rest on the grip for
 * 150 ms before it lifts, so scrolling past doesn't move anything. Arrow keys work on the grip too.
 */
export function SortableList<T extends { id: number }>({
  items,
  labelOf,
  onReorder,
  renderItem,
  className,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function dragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(Number(active.id));
    const to = ids.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]} onDragEnd={dragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className={cx("flex flex-col gap-2.5", className)}>
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id} label={labelOf(item)}>
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
