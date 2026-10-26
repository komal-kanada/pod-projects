"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";

/** A labelled native select — accessible and right on mobile for free. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <span className="inline-flex items-center gap-2 text-[0.8125rem]">
      <label htmlFor={id} className="text-muted-foreground">
        {label}
      </label>
      <span className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as T)}
          className="border-hairline bg-surface hover:bg-surface-2 h-8 appearance-none rounded-full border py-0 pr-7 pl-3 font-medium transition-colors disabled:opacity-50"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2"
          aria-hidden
        />
      </span>
    </span>
  );
}
