import type { ButtonHTMLAttributes } from "react";
import { cn } from "../cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "sm";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-foreground hover:bg-brand/90",
  secondary: "border-hairline bg-surface text-foreground hover:bg-surface-2 border",
  ghost: "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
};

const SIZES: Record<Size, string> = {
  md: "h-11 gap-2 px-5 text-[0.9375rem]",
  sm: "h-8 gap-1.5 px-3 text-[0.8125rem]",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "press rounded-panel inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 ease-[var(--ease-ios)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}
