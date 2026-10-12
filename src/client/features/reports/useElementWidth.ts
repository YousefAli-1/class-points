import { useLayoutEffect, useState } from "react";

/** The width of an element in CSS pixels, kept up to date with a ResizeObserver. 0 until measured. */
export function useElementWidth<T extends HTMLElement>(): [ref: (node: T | null) => void, width: number] {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    if (!node) return;
    const measure = () => setWidth(Math.floor(node.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, width];
}
