import { cn } from "./cn";

/** The POD mark: three bars, one per project, the first lit. */
export function PodMark({
  href,
  label = "POD",
  className,
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  const content = (
    <>
      <span
        aria-hidden
        className="bg-ink flex size-7 items-end justify-center gap-[2.5px] rounded-[9px] pb-[7px]"
      >
        <span className="bg-brand h-3 w-[3px] rounded-full" />
        <span className="bg-ink-foreground/45 h-2 w-[3px] rounded-full" />
        <span className="bg-ink-foreground/45 h-2.5 w-[3px] rounded-full" />
      </span>
      <span className="text-[0.975rem]">{label}</span>
    </>
  );

  const classes = cn(
    "rounded-tight -m-1 flex items-center gap-2.5 p-1 font-medium tracking-[-0.02em]",
    className,
  );

  // Cross-app link: a plain <a>, since each POD app is a separate deployment.
  return href ? (
    <a href={href} className={classes}>
      {content}
    </a>
  ) : (
    <span className={classes}>{content}</span>
  );
}
