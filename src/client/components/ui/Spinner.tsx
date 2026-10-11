/** A round loading spinner in the current text colour. With reduced motion it holds still. */
export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <span role="status" aria-label="Loading" className="inline-flex shrink-0">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="motion-safe:animate-spin">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3.5" opacity="0.22" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
