"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { isThemePreference, setThemePreference, subscribeTheme, themeSnapshot, type ThemePreference } from "@/lib/theme";

const choices: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light mode", icon: Sun },
  { value: "dark", label: "Dark mode", icon: Moon },
  { value: "system", label: "Use device theme", icon: Monitor },
];

export function ThemeControl() {
  const state = useSyncExternalStore(subscribeTheme, themeSnapshot, () => "system:");
  const [value, storageError] = state.split(":");
  const preference = isThemePreference(value) ? value : "system";
  return <div className="text-sm">
    <div role="group" aria-label="Color theme" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1">
      {choices.map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-label={label} title={label}
        aria-pressed={preference === value} onClick={() => setThemePreference(value)}
        className={`rounded-md p-2 ${preference === value ? "bg-teal-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
        <Icon size={18} aria-hidden="true" />
      </button>)}
    </div>
    {storageError && <p role="status" className="mt-1 max-w-48 text-xs text-rose-700">Theme preference could not be saved in this browser.</p>}
  </div>;
}
