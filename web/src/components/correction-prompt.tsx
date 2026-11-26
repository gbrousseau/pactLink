import Link from "next/link";

export function CorrectionPrompt({ phase, warning, href }: { phase: string; warning: string; href: string }) {
  return <section className="panel space-y-3">
    <h2 className="text-lg font-bold">Correct approved {phase}</h2>
    <p className="text-sm text-amber-900">{warning}</p>
    <Link href={href} className="btn-secondary">Continue to correction</Link>
  </section>;
}
