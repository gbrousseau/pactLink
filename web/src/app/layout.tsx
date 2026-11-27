import type { Metadata } from "next";
import Script from "next/script";
import { themeStorageKey } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deflection Workspace",
  description: "Synthetic-data deflection referral demo.",
  robots: { index: false, follow: false },
};

const themeScript = `(() => {
  let preference = "system";
  try {
    const stored = localStorage.getItem("${themeStorageKey}");
    if (stored === "light" || stored === "dark") preference = stored;
  } catch (error) {
    document.documentElement.dataset.themeStorageError = "true";
    console.warn("Theme preference is unavailable.", error);
  }
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = preference === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
