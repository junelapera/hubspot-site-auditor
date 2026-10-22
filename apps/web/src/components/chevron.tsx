import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = { className?: string };

// Decorative: the surrounding text or control already says what it does.

/** Points right; turns down when its <details className="group"> is open. */
export function DisclosureChevron({ className = "" }: Props) {
  return <ChevronRight aria-hidden="true" strokeWidth={2.5} className={`size-4 shrink-0 transition-transform motion-reduce:transition-none group-open:rotate-90 ${className}`} />;
}

export function BackChevron({ className = "" }: Props) {
  return <ChevronLeft aria-hidden="true" strokeWidth={2.5} className={`size-4 shrink-0 ${className}`} />;
}

export function NextChevron({ className = "" }: Props) {
  return <ChevronRight aria-hidden="true" strokeWidth={2.5} className={`size-3.5 shrink-0 ${className}`} />;
}
