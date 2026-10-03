import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solmap: is solar worth it on your roof?",
  description:
    "Type your BC address and see whether rooftop solar pays off under BC Hydro's 2026 rules.",
};

// Fonts are the system stack from the design tokens (globals.css), so there's nothing to load here.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
