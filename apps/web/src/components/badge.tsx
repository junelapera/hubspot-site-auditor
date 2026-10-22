import { IMPACT_STYLE } from "@/lib/format";

export function Badge({ tone, children }: { tone: keyof typeof IMPACT_STYLE; children: React.ReactNode }) {
  return <span className={`chip ${IMPACT_STYLE[tone]}`}>{children}</span>;
}
