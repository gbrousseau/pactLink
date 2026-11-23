"use client";

import { useState, useTransition } from "react";
import { importIntakesAction, type ImportState } from "@/app/actions";

export function ImportForm({ groups }: { groups: { id: string; name: string }[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [group, setGroup] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [reimport, setReimport] = useState(false);
  const [result, setResult] = useState<ImportState>({});
  const [pending, startTransition] = useTransition();
  function run(intent: "preview" | "import") {
    if (!file) { setResult({ error: "Select a file." }); return; }
    const form = new FormData();
    form.set("file", file); form.set("group", group); form.set("intent", intent);
    if (result.hash) form.set("previewHash", result.hash);
    if (confirmed) form.set("confirmed", "yes");
    if (reimport) form.set("confirmReimport", "yes");
    startTransition(async () => setResult(await importIntakesAction(form)));
  }
  return <div className="panel space-y-5">
    <p className="text-sm leading-6 text-slate-600">Development only: import synthetic data using the supplied 25-column CSV or tab-separated template. All records are drafts. No address field exists in the current Intake.</p>
    <label className="block text-sm font-semibold">Assign drafts to group
      <select className="input mt-2" value={group} onChange={(event) => { setGroup(event.target.value); setResult({}); setReimport(false); }}>
        <option value="">Select a group</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <label className="block text-sm font-semibold">CSV or TSV file (UTF-8, max 4 MiB)
      <input className="input mt-2" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult({}); setConfirmed(false); setReimport(false); }} />
    </label>
    <button className="btn-secondary" type="button" disabled={pending || !file || !group} onClick={() => run("preview")}>Preview import</button>
    {result.error && <p role="alert" className="error-box">{result.error}</p>}
    {result.hash && <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p role="status">{result.imported !== undefined ? `Imported ${result.imported} drafts.` : `${result.valid} of ${result.total} records can be imported.`} {result.issues?.length ?? 0} records skipped.</p>
      <p>Every name is a generated placeholder; {result.mockDob} records also need a generated DOB. Replace placeholders before review. All source columns are retained; only valid DOBs are mapped to Intake. Exact-file matching does not detect duplicates in changed files.</p>
      {!!result.previous?.batches && <p className="font-semibold">This file was imported previously. {result.previous.active} prior records remain active. Re-import is allowed only after all prior records are removed.</p>}
      {!!result.issues?.length && <details><summary>Skipped record numbers (first 100)</summary><ul className="mt-2 list-inside list-disc">{result.issues.slice(0, 100).map((issue) => <li key={issue.record}>Record {issue.record}: {issue.message}</li>)}</ul><p>Record numbers count CSV records, including the header; a quoted multiline record counts as one.</p></details>}
      {result.imported === undefined && <>
        <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm this file contains only synthetic data and understand that placeholders must be replaced.</label>
        {!!result.previous?.batches && !result.previous.active && <label className="flex gap-2"><input type="checkbox" checked={reimport} onChange={(event) => setReimport(event.target.checked)} />I reviewed the previous import history and explicitly confirm re-importing this file.</label>}
        <button className="btn-primary" type="button" disabled={pending || !confirmed || !result.valid || !!result.previous?.active || (!!result.previous?.batches && !reimport)} onClick={() => run("import")}>Import valid records</button>
      </>}
    </div>}
    {pending && <p role="status" className="text-sm">Processing file; please wait…</p>}
  </div>;
}
