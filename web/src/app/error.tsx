"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl px-4 py-16"><div className="panel">
    <h1 className="text-xl font-bold">The workspace could not complete this request</h1>
    <p role="alert" className="my-4 text-sm leading-6 text-slate-600">No successful save is being reported. Check the database connection and development setup, then retry. Do not enter real legal or health information.</p>
    <button className="btn-primary" onClick={reset}>Retry</button>
  </div></main>;
}
