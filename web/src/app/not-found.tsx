import Link from "next/link";
export default function NotFound() {
  return <main className="mx-auto max-w-xl p-8"><div className="panel"><h1 className="text-xl font-bold">Record unavailable</h1><p className="my-4 text-sm text-slate-500">The record does not exist or is not available to your account.</p><Link className="btn-primary" href="/forms">Return to library</Link></div></main>;
}
