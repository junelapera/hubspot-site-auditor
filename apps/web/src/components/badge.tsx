import { IMPACT_STYLE } from "@/lib/format";

export function Badge({ tone, children }: { tone: keyof typeof IMPACT_STYLE; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${IMPACT_STYLE[tone]}`}>
      {children}
    </span>
  );
}
