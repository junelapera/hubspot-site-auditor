"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
