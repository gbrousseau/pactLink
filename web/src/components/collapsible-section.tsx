import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({ title, children, defaultOpen = true, className = "panel", contentClassName = "mt-5 space-y-4", level = 2, hidden = false, id }: {
  title: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string;
  contentClassName?: string; level?: 2 | 3 | 4; hidden?: boolean; id?: string;
}) {
  const Heading = `h${level}` as const;
  return <details id={id} open={defaultOpen} hidden={hidden} className={`${className} [&[open]>summary>svg]:rotate-180`}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold marker:content-none [&::-webkit-details-marker]:hidden">
      <Heading className={level === 2 ? "text-lg" : "text-base"}>{title}</Heading>
      <ChevronDown aria-hidden="true" size={20} className="shrink-0 transition-transform" />
    </summary>
    <div className={contentClassName}>{children}</div>
  </details>;
}
