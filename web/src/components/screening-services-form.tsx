"use client";

import { useActionState, useState } from "react";
import { screeningServicesAction, type ActionState } from "@/app/actions";
import {
  identificationOptions, mentalHealthDiagnoses, referralTypes, screeningTools, screeningsReceived,
  serviceCategories, serviceReasons, serviceStatuses, substanceTypes, type ScreeningServicesAnswers,
} from "@/lib/screening-service-schema";
import { CollapsibleSection } from "./collapsible-section";

function ChoiceGroup<T extends string>({ label, name, options, value, onChange, type = "checkbox" }: {
  label: string; name: string; options: readonly T[]; value: T[] | T;
  onChange: (value: T[] | T | "") => void; type?: "checkbox" | "radio";
}) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  return <fieldset className="space-y-2">
    <legend className="mb-2 text-sm font-semibold">{label}</legend>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{options.map((option, index) => <label key={option} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm">
      <input type={type} id={`${name}-${index}`} name={name} value={option} checked={selected.includes(option)}
        onChange={(event) => {
          if (type === "radio") onChange(event.target.checked ? option : "");
          else onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option));
        }} className="mt-0.5 shrink-0 accent-teal-800" />
      <span>{option}</span>
    </label>)}</div>
  </fieldset>;
}

export function ScreeningServicesForm({ id, revision, initial }: {
  id: string; revision?: number; initial: ScreeningServicesAnswers;
}) {
  const [state, action, pending] = useActionState(screeningServicesAction, {} as ActionState);
  const [answers, setAnswers] = useState(initial);
  const set = <K extends keyof ScreeningServicesAnswers>(key: K, value: ScreeningServicesAnswers[K]) =>
    setAnswers((old) => ({ ...old, [key]: value }));
  const updateService = (name: string, key: "statuses" | "reasons" | "otherService", value: string | string[]) =>
    setAnswers((old) => ({ ...old, services: { ...old.services, [name]: { ...old.services[name], [key]: value } } }));
  const textInput = (name: string, label: string, value: string, onChange: (value: string) => void, type = "text") =>
    <label className="block text-sm font-semibold">{label}<input className="input mt-2" name={name} type={type} maxLength={300} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
  return <form action={action} className="space-y-6">
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="revision" value={revision ?? ""} />
    <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Synthetic data only. Name and date of birth are not collected on this phase; those belong to Consent. No screening or service question is required by the source form. Leave service rows blank when no referral was made.</div>
    {state.error && <p role="alert" className="error-box">{state.error}</p>}
    <CollapsibleSection title="Screenings and assessments" contentClassName="mt-5 space-y-6">
      <ChoiceGroup label="What types of screenings or assessments were administered during the deflection event? (Select all that apply.)" name="screeningTypes" options={screeningTools} value={answers.screeningTypes} onChange={(value) => set("screeningTypes", value as ScreeningServicesAnswers["screeningTypes"])} />
      {answers.screeningTypes.includes("Other assessment") && textInput("screeningTypesOther", "Specify other assessment", answers.screeningTypesOther, (value) => set("screeningTypesOther", value))}
      {!answers.screeningTypes.includes("Other assessment") && <input type="hidden" name="screeningTypesOther" value="" />}
    </CollapsibleSection>
    <CollapsibleSection title="Substance use" contentClassName="mt-5 space-y-6">
      <ChoiceGroup label="Does the participant have a substance use disorder?" name="substanceDisorder" options={["Yes", "No", "Don't know"]} value={answers.substanceDisorder} onChange={(value) => set("substanceDisorder", value as ScreeningServicesAnswers["substanceDisorder"])} type="radio" />
      <ChoiceGroup label="How was the substance use disorder identified? (Select all that apply.)" name="substanceIdentification" options={identificationOptions} value={answers.substanceIdentification} onChange={(value) => set("substanceIdentification", value as ScreeningServicesAnswers["substanceIdentification"])} />
      {answers.substanceIdentification.includes("Other") && textInput("substanceIdentificationOther", "Other identification method", answers.substanceIdentificationOther, (value) => set("substanceIdentificationOther", value))}
      <ChoiceGroup label="Substance type (Select all that apply.)" name="substanceTypes" options={substanceTypes} value={answers.substanceTypes} onChange={(value) => set("substanceTypes", value as ScreeningServicesAnswers["substanceTypes"])} />
      {answers.substanceTypes.includes("Other") && textInput("substanceTypesOther", "Specify other substance", answers.substanceTypesOther, (value) => set("substanceTypesOther", value))}
      {!answers.substanceTypes.includes("Other") && <input type="hidden" name="substanceTypesOther" value="" />}
    </CollapsibleSection>
    <CollapsibleSection title="Mental health" contentClassName="mt-5 space-y-6">
      <ChoiceGroup label="Does the participant have a mental health disorder?" name="mentalHealthDisorder" options={["Yes", "No", "Don't know"]} value={answers.mentalHealthDisorder} onChange={(value) => set("mentalHealthDisorder", value as ScreeningServicesAnswers["mentalHealthDisorder"])} type="radio" />
      <ChoiceGroup label="How was the mental health disorder identified? (Select all that apply.)" name="mentalHealthIdentification" options={identificationOptions} value={answers.mentalHealthIdentification} onChange={(value) => set("mentalHealthIdentification", value as ScreeningServicesAnswers["mentalHealthIdentification"])} />
      {answers.mentalHealthIdentification.includes("Other") && textInput("mentalHealthIdentificationOther", "Other identification method", answers.mentalHealthIdentificationOther, (value) => set("mentalHealthIdentificationOther", value))}
      <ChoiceGroup label="Mental health diagnosis (Select all that apply.)" name="mentalHealthDiagnoses" options={mentalHealthDiagnoses} value={answers.mentalHealthDiagnoses} onChange={(value) => set("mentalHealthDiagnoses", value as ScreeningServicesAnswers["mentalHealthDiagnoses"])} />
      {answers.mentalHealthDiagnoses.includes("Other") && textInput("mentalHealthDiagnosesOther", "Specify other diagnosis", answers.mentalHealthDiagnosesOther, (value) => set("mentalHealthDiagnosesOther", value))}
      {!answers.mentalHealthDiagnoses.includes("Other") && <input type="hidden" name="mentalHealthDiagnosesOther" value="" />}
    </CollapsibleSection>
    <CollapsibleSection title="Program screenings and referrals" contentClassName="mt-5 space-y-6">
      <ChoiceGroup label="Screenings or assessments received while in the deflection program (Select all that apply.)" name="screeningsReceived" options={screeningsReceived} value={answers.screeningsReceived} onChange={(value) => set("screeningsReceived", value as ScreeningServicesAnswers["screeningsReceived"])} />
      <div className="grid gap-5 md:grid-cols-2">
        {textInput("asamCompletionDate", "ASAM completion date", answers.asamCompletionDate, (value) => set("asamCompletionDate", value), "date")}
        {textInput("asamLocation", "ASAM completion location", answers.asamLocation, (value) => set("asamLocation", value))}
      </div>
      <ChoiceGroup label="Types of referrals the participant received (Select all that apply.)" name="referralTypes" options={referralTypes} value={answers.referralTypes} onChange={(value) => set("referralTypes", value as ScreeningServicesAnswers["referralTypes"])} />
      {answers.referralTypes.includes("Other") && textInput("referralTypesOther", "Specify other referral", answers.referralTypesOther, (value) => set("referralTypesOther", value))}
      {!answers.referralTypes.includes("Other") && <input type="hidden" name="referralTypesOther" value="" />}
    </CollapsibleSection>
    <CollapsibleSection title="Services referred and received" className="space-y-4" contentClassName="mt-4 space-y-4">
      <p className="panel text-sm leading-6 text-slate-600">If the participant was not referred to a service, leave its row blank. When a service was referred but not received, select one or more reasons. Referred and received can both be marked; incompatible outcomes are rejected.</p>
      {Object.entries(serviceCategories).map(([category, services]) => <CollapsibleSection key={category} title={category} level={3}>
        {services.map((name) => {
          const item = answers.services[name];
          return <CollapsibleSection key={name} title={name} level={4} className="border-t border-slate-200 pt-4" contentClassName="mt-4 space-y-4">
            <ChoiceGroup label="Select applicable status" name={`service:${name}:statuses`} options={serviceStatuses} value={item.statuses} onChange={(value) => updateService(name, "statuses", value)} />
            {name === "Other service" && item.statuses.length > 0 && textInput(`service:${name}:otherService`, "Describe other service", item.otherService, (value) => updateService(name, "otherService", value))}
            {item.statuses.includes("Referred but didn't receive") && <>
              <ChoiceGroup label="Reason service was not received (Select all that apply.)" name={`service:${name}:reasons`} options={serviceReasons} value={item.reasons} onChange={(value) => updateService(name, "reasons", value)} />
            </>}
            {name !== "Other service" && <input type="hidden" name={`service:${name}:otherService`} value="" />}
          </CollapsibleSection>;
        })}
      </CollapsibleSection>)}
    </CollapsibleSection>
    <label className="block text-sm font-semibold">Note for reviewer (optional)
      <textarea name="reviewNote" className="input mt-2" rows={4} maxLength={2000} value={answers.reviewNote ?? ""}
        onChange={(event) => set("reviewNote", event.target.value)} />
      <span className="mt-1 block text-xs font-normal text-slate-500">Share context about this Screening and Services submission. Visible to users who can review this referral.</span>
    </label>
    <div className="flex flex-wrap gap-3">
      <button name="intent" value="draft" disabled={pending} className="btn-secondary">{pending ? "Saving…" : "Save Screening and Services draft"}</button>
      <button name="intent" value="request" disabled={pending} className="btn-primary">{pending ? "Saving…" : "Save and request review"}</button>
    </div>
  </form>;
}
