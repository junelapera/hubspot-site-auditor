"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

export interface ScanOption {
  value: string;
  label: React.ReactNode;
  /** Secondary line, e.g. "10 pages · 9 issues". */
  detail?: string;
}

/**
 * Brand-styled select (Radix: listbox semantics, keyboard and type-ahead built in).
 * Pass `name` to submit with a regular <form>; Radix renders a hidden native select for it.
 */
export function ScanSelect({
  id,
  name,
  options,
  defaultValue,
}: {
  id: string;
  name: string;
  options: ScanOption[];
  defaultValue?: string;
}) {
  return (
    <Select.Root name={name} defaultValue={defaultValue}>
      <Select.Trigger
        id={id}
        className="input mt-1 flex items-center justify-between gap-3 text-left [&_[data-option-text]]:flex-nowrap [&_[data-option-text]]:overflow-hidden data-[state=open]:ring-2 data-[state=open]:ring-ink data-[state=open]:ring-offset-1 data-[state=open]:ring-offset-cream"
      >
        <span className="min-w-0 truncate">
          <Select.Value />
        </span>
        <Select.Icon asChild>
          <ChevronDown aria-hidden="true" strokeWidth={2.5} className="size-4 shrink-0" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[min(var(--radix-select-content-available-height),22rem)] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-ink bg-paper"
        >
          <Select.Viewport className="p-1.5">
            {options.map((o) => (
              <Select.Item
                key={o.value}
                value={o.value}
                className="relative cursor-pointer select-none rounded-lg py-2 pr-3 pl-9 text-sm text-ink outline-none data-[highlighted]:bg-yellow data-[state=checked]:font-semibold"
              >
                <Select.ItemIndicator className="absolute top-2.5 left-3">
                  <Check aria-hidden="true" strokeWidth={3} className="size-4" />
                </Select.ItemIndicator>
                {/* Detail sits inside ItemText so the option's accessible name matches what's shown (WCAG 2.5.3). */}
                <Select.ItemText>
                  {/* Wraps the detail under the date on narrow screens; the trigger keeps it on one line. */}
                  <span data-option-text className="flex flex-wrap items-baseline gap-x-2">
                    <span className="whitespace-nowrap">{o.label}</span>
                    {o.detail && (
                      <span className="font-mono text-[11px] font-normal tracking-[0.04em] whitespace-nowrap text-ink/75 uppercase">
                        · {o.detail}
                      </span>
                    )}
                  </span>
                </Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
