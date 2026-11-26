import Link from "next/link";
import { CollapsibleSection } from "./collapsible-section";

export function CorrectionPrompt({ phase, warning, href }: { phase: string; warning: string; href: string }) {
  return <CollapsibleSection title={`Correct approved ${phase}`} contentClassName="mt-5 space-y-3">
    <p className="text-sm text-amber-900">{warning}</p>
    <Link href={href} className="btn-secondary">Continue to correction</Link>
  </CollapsibleSection>;
}
