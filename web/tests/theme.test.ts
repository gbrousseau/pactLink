import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeControl } from "../src/components/theme-control";
import { setThemePreference, subscribeTheme, themeSnapshot, themeStorageKey } from "../src/lib/theme";

function browser() {
  const dataset: Record<string, string> = {};
  const media = Object.assign(new EventTarget(), { matches: false });
  const window = Object.assign(new EventTarget(), { matchMedia: () => media });
  const storage = { setItem: vi.fn() };
  vi.stubGlobal("document", { documentElement: { dataset } });
  vi.stubGlobal("window", window);
  vi.stubGlobal("localStorage", storage);
  return { dataset, media, window, storage };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Color theme", () => {
  it("offers labeled icon buttons including the device preference", () => {
    const markup = renderToStaticMarkup(createElement(ThemeControl));
    expect(markup).toContain('aria-label="Light mode"');
    expect(markup).toContain('aria-label="Dark mode"');
    expect(markup).toContain('aria-label="Use device theme"');
    expect(markup).toContain('aria-label="Use device theme" title="Use device theme" aria-pressed="true"');
    expect(markup).not.toContain("<select");
  });

  it("persists an explicit preference and follows system changes only in system mode", () => {
    const { dataset, media, storage } = browser();
    const notify = vi.fn();
    const unsubscribe = subscribeTheme(notify);
    setThemePreference("dark");
    expect(storage.setItem).toHaveBeenCalledWith(themeStorageKey, "dark");
    expect(themeSnapshot()).toBe("dark:");
    media.matches = false;
    media.dispatchEvent(new Event("change"));
    expect(dataset.theme).toBe("dark");
    setThemePreference("system");
    expect(dataset.theme).toBe("light");
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(dataset.theme).toBe("dark");
    expect(notify).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("updates from other tabs and stops listening after unsubscribe", () => {
    const { dataset, window } = browser();
    const notify = vi.fn();
    const unsubscribe = subscribeTheme(notify);
    window.dispatchEvent(Object.assign(new Event("storage"), { key: themeStorageKey, newValue: "dark" }));
    expect(dataset.theme).toBe("dark");
    expect(themeSnapshot()).toBe("dark:");
    window.dispatchEvent(Object.assign(new Event("storage"), { key: "unrelated", newValue: "light" }));
    expect(notify).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.dispatchEvent(Object.assign(new Event("storage"), { key: themeStorageKey, newValue: "light" }));
    expect(dataset.theme).toBe("dark");
  });

  it("applies the theme and reports when the preference cannot be saved", () => {
    const { dataset, storage } = browser();
    storage.setItem.mockImplementation(() => { throw new Error("Storage blocked"); });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    setThemePreference("dark");
    expect(dataset.theme).toBe("dark");
    expect(themeSnapshot()).toBe("dark:true");
    expect(warning).toHaveBeenCalled();
  });
});
