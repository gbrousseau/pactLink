"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { saveIntakeAction } from "@/app/actions";
import { intakeSections, otherOption, type IntakeField } from "@/lib/intake-fields";
import { getIntakeCompleteness, type Answers } from "@/lib/intake-validation";

export function IntakeForm({ initial = {}, id, revision }: {
  initial?: Answers; id?: string; revision?: number;
}) {
  const [state, action, pending] = useActionState(saveIntakeAction, {});
  const [answers, setAnswers] = useState<Answers>(initial);
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const warnNavigation = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.href === window.location.href || link.getAttribute("href")?.startsWith("#")) return;
      if (!window.confirm("Leave without saving your changes?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", warnNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", warnNavigation, true);
    };
  }, [dirty, pending]);
  const set = (key: string, value: string | string[]) => { setDirty(true); setAnswers((old) => ({ ...old, [key]: value })); };
  const updateSelection = (field: IntakeField, value: string | string[]) => {
    setAnswers((old) => {
      const next: Answers = { ...old, [field.key]: value };
      const selected = Array.isArray(value) ? value : [value];
      const other = otherOption(field);
      if (other && !selected.includes(other)) next[`${field.key}Other`] = "";
      for (const section of intakeSections) for (const dependent of section.fields) {
        if (dependent.when?.key === field.key && value !== dependent.when.value) {
          next[dependent.key] = dependent.type === "multi" ? [] : "";
          if (otherOption(dependent)) next[`${dependent.key}Other`] = "";
        }
      }
      return next;
    });
    setDirty(true);
  };
  const errorKeys = Object.keys(state.errors ?? {});
  const completeness = getIntakeCompleteness(answers);
  const displayAnswer = (key: string) => {
    const value = answers[key];
    return Array.isArray(value) ? value.join("; ") || "Unanswered" : value || "Unanswered";
  };
  const review = step === intakeSections.length;
  return <form action={action} className="space-y-6">
    {id && <><input type="hidden" name="id" value={id} /><input type="hidden" name="revision" value={revision} /></>}
    <div className="flex flex-wrap gap-2" aria-label="Form sections">
      {[...intakeSections.map((s) => s.title), "Review"].map((title, index) =>
        <button type="button" key={title} onClick={() => setStep(index)} aria-current={index === step ? "step" : undefined}
          aria-label={index < intakeSections.length && completeness.sections[index] > 0
            ? `${title}, ${completeness.sections[index]} unanswered`
            : title}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${index === step
            ? "bg-teal-800 text-white"
            : index < intakeSections.length && completeness.sections[index] > 0
              ? "step-incomplete"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}>
          {index < intakeSections.length && completeness.sections[index] > 0 && <AlertCircle size={14} aria-hidden="true" />}
          {index + 1}. {title}
          {index < intakeSections.length && completeness.sections[index] > 0 && <span className="rounded-full bg-rose-200 px-1.5 py-0.5 text-[10px] leading-none">{completeness.sections[index]}</span>}
        </button>)}
    </div>
    <div role="status" aria-live="polite" className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${completeness.totalMissing
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : "border-teal-200 bg-teal-50 text-teal-900"}`}>
      {completeness.totalMissing
        ? <><AlertCircle size={19} className="mt-0.5 shrink-0" aria-hidden="true" /><p><strong>{completeness.totalMissing} unanswered item{completeness.totalMissing === 1 ? "" : "s"}.</strong> Answer all applicable questions before requesting review. Saving keeps this referral as a draft.</p></>
        : <><Save size={19} className="mt-0.5 shrink-0" aria-hidden="true" /><p><strong>All visible questions have answers.</strong> Save the draft, then request review from the record page.</p></>}
    </div>
    {state.message && <div role="alert" className="error-box">
      <p className="font-semibold">{state.message}</p>
      {errorKeys.length > 0 && <ul className="mt-2 list-inside list-disc">{errorKeys.map((key) => <li key={key}>
        <button type="button" className="underline" onClick={() => {
          const index = intakeSections.findIndex((s) => s.fields.some((f) => f.key === key || `${f.key}Other` === key));
          if (index >= 0) setStep(index);
          setTimeout(() => document.getElementById(key)?.focus(), 0);
        }}>{state.errors?.[key]}</button>
      </li>)}</ul>}
    </div>}
    {intakeSections.map((section, index) => <section key={section.title} hidden={step !== index} className="panel">
      <h2 className="text-xl font-bold">{section.title}</h2>
      <p className="mb-6 mt-2 text-sm leading-6 text-slate-500">{section.description}</p>
      <div className="space-y-7">{section.fields.map((field) => {
        const conditionalHidden = !!field.when && answers[field.when.key] !== field.when.value;
        const value = answers[field.key] ?? (field.type === "multi" ? [] : "");
        const options = field.options;
        const other = otherOption(field);
        const selected = Array.isArray(value) ? value : [value];
        const error = state.errors?.[field.key];
        const missing = completeness.missingBySection[index].includes(field.key);
        const needsOther = !!other && selected.includes(other) && completeness.missingBySection[index].includes(`${field.key}Other`);
        const incomplete = missing || needsOther || !!error;
        const hintId = `${field.key}-hint`, errorId = `${field.key}-error`;
        return <div key={field.key} hidden={conditionalHidden} className={incomplete ? "missing-answer" : undefined}>
          {options ? <fieldset aria-invalid={incomplete} aria-describedby={`${hintId} ${incomplete ? errorId : ""}`}>
            <legend className="mb-3 text-sm font-semibold">{field.label}{field.required && " *"}{missing && <span className="ml-2 text-xs font-semibold text-rose-700">Answer needed</span>}</legend>
            <p id={hintId} className="mb-3 text-xs text-slate-500">{field.hint ?? (field.type === "multi" ? "Select all that apply." : "Select one. Leave unanswered if not yet known.")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((option, n) => <label key={option} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm leading-5 ${selected.includes(option) ? "border-teal-600 bg-teal-50" : "border-slate-200 hover:bg-slate-50"}`}>
                <input id={n === 0 ? field.key : `${field.key}-${n}`} type={field.type === "multi" ? "checkbox" : "radio"}
                  name={field.key} value={option} checked={selected.includes(option)} disabled={conditionalHidden}
                  aria-invalid={!!error} className="mt-0.5 h-4 w-4 shrink-0 accent-teal-800"
                  onChange={(event) => updateSelection(field, field.type === "multi"
                    ? event.target.checked ? [...selected.filter(Boolean), option] : selected.filter((entry) => entry !== option)
                    : option)} />
                {option}
              </label>)}
            </div>
            {field.type === "single" && value && <button type="button" className="mt-2 text-xs text-teal-800 underline" onClick={() => updateSelection(field, "")}>Clear answer</button>}
          </fieldset> : <>
            <label htmlFor={field.key} className="mb-2 block text-sm font-semibold">{field.label}{field.required && " *"}{missing && <span className="ml-2 text-xs font-semibold text-rose-700">Answer needed</span>}</label>
            <input id={field.key} name={field.key} type={field.type} className="input" value={typeof value === "string" ? value : ""}
              maxLength={500} aria-invalid={incomplete} aria-describedby={incomplete ? errorId : undefined}
              onChange={(event) => set(field.key, event.target.value)} />
          </>}
          {error && <p id={errorId} className="mt-2 text-sm text-red-700">{error}</p>}
          {!error && missing && <p id={errorId} className="mt-2 text-sm font-medium text-rose-700">Answer this question before the referral can be considered complete.</p>}
          {other && <div hidden={!selected.includes(other)} className="mt-3">
            <label htmlFor={`${field.key}Other`} className="mb-2 block text-sm font-medium">Specify {other.toLowerCase()}{needsOther && <span className="ml-2 text-xs font-semibold text-rose-700">Answer needed</span>}</label>
            <input id={`${field.key}Other`} name={`${field.key}Other`} className="input" maxLength={500}
              disabled={conditionalHidden || !selected.includes(other)}
              aria-invalid={!!state.errors?.[`${field.key}Other`] || needsOther} aria-describedby={`${field.key}Other-error`}
              value={typeof answers[`${field.key}Other`] === "string" ? answers[`${field.key}Other`] : ""}
              onChange={(event) => set(`${field.key}Other`, event.target.value)} />
            {state.errors?.[`${field.key}Other`] && <p id={`${field.key}Other-error`} className="mt-2 text-sm text-red-700">{state.errors[`${field.key}Other`]}</p>}
            {!state.errors?.[`${field.key}Other`] && needsOther && <p id={`${field.key}Other-error`} className="mt-2 text-sm font-medium text-rose-700">Specify the other answer before the referral can be considered complete.</p>}
          </div>}
        </div>;
      })}</div>
    </section>)}
    {review && <section className="panel">
      <h2 className="text-xl font-bold">Review referral</h2>
      <p className="mb-6 mt-2 text-sm text-slate-500">Review answers before saving. A different reviewer must approve the saved draft; this is not a participant signature.</p>
      {intakeSections.map((section) => <div key={section.title} className="mb-6">
        <h3 className="mb-3 border-b border-slate-200 pb-2 font-semibold text-teal-900">{section.title}</h3>
        <dl className="grid gap-3">{section.fields.filter((field) => !field.when || answers[field.when.key] === field.when.value).map((field) => {
          const missing = completeness.missingBySection[intakeSections.indexOf(section)].includes(field.key);
          const needsOther = !!otherOption(field) && (Array.isArray(answers[field.key]) ? answers[field.key].includes(otherOption(field)!) : answers[field.key] === otherOption(field))
            && completeness.missingBySection[intakeSections.indexOf(section)].includes(`${field.key}Other`);
          return <div key={field.key} className={`grid gap-1 rounded-lg p-2 text-sm sm:grid-cols-2 ${missing || needsOther ? "bg-rose-50 text-rose-900 ring-1 ring-rose-200" : ""}`}>
          <dt className="text-slate-500">{field.label}{(missing || needsOther) && <span className="ml-2 font-semibold text-rose-700">Unanswered</span>}</dt><dd className="break-words">{displayAnswer(field.key)}
            {answers[`${field.key}Other`] && ` (${answers[`${field.key}Other`]})`}
            {needsOther && <span className="ml-2 font-semibold text-rose-700">Specify other answer</span>}</dd>
        </div>;})}</dl>
      </div>)}
      <label className="block text-sm font-semibold">Note for reviewer (optional)
        <textarea name="reviewNote" className="input mt-2" rows={4} maxLength={2000}
          value={typeof answers.reviewNote === "string" ? answers.reviewNote : ""}
          onChange={(event) => set("reviewNote", event.target.value)} />
        <span className="mt-1 block text-xs font-normal text-slate-500">Share context about this Intake submission. Visible to users who can review this referral.</span>
      </label>
    </section>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex gap-2">
        <button type="button" disabled={step === 0} className="btn-secondary" onClick={() => setStep(step - 1)}><ChevronLeft size={16} />Back</button>
        {!review && <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>Continue<ChevronRight size={16} /></button>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500">{pending ? "Saving..." : dirty || state.message ? "Changes not saved" : id ? "Loaded saved record" : "New unsaved draft"}</span>
        <button name="intent" value="draft" disabled={pending} className="btn-primary"><Save size={16} />Save draft</button>
      </div>
    </div>
    <Link href={id ? `/forms/${id}` : "/forms"} className="text-sm text-slate-500 underline">Cancel and return</Link>
  </form>;
}
