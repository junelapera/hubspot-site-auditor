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
      className={`btn btn-sm shrink-0 ${copied ? "bg-mint" : "btn-secondary"}`}
    >
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
