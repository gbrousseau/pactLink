import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deflection Workspace",
  description: "Development-only, access-controlled deflection intake pilot.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
