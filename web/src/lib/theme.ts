export type ThemePreference = "system" | "light" | "dark";
export const themeStorageKey = "deflection-theme";
const changeEvent = "deflection-theme-change";

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
}

export function themeSnapshot() {
  const root = document.documentElement;
  return `${root.dataset.themePreference ?? "system"}:${root.dataset.themeStorageError ?? ""}`;
}

export function setThemePreference(preference: ThemePreference) {
  applyTheme(preference);
  try {
    localStorage.setItem(themeStorageKey, preference);
    delete document.documentElement.dataset.themeStorageError;
  } catch (error) {
    document.documentElement.dataset.themeStorageError = "true";
    console.warn("Could not save theme preference.", error);
  }
  window.dispatchEvent(new Event(changeEvent));
}

export function subscribeTheme(notify: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (document.documentElement.dataset.themePreference === "system") applyTheme("system");
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== themeStorageKey && event.key !== null) return;
    applyTheme(isThemePreference(event.newValue) ? event.newValue : "system");
    delete document.documentElement.dataset.themeStorageError;
    notify();
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, notify);
  return () => {
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changeEvent, notify);
  };
}
