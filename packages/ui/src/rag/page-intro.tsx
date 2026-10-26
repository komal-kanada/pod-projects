import type { ReactNode } from "react";

/** The top of each screen: eyebrow, title, one line of context, and a status slot. */
export function PageIntro({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="animate-rise mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-10">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-[1.875rem] leading-[1.1] font-medium tracking-[-0.025em] sm:text-[2.375rem]">
          {title}
        </h1>
        {children ? (
          <p className="text-muted-foreground mt-3 max-w-[62ch] text-[0.9375rem] leading-relaxed">{children}</p>
        ) : null}
      </div>
      {aside}
    </section>
  );
}
