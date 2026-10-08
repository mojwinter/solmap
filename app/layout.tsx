import type { Metadata } from "next";
import "./globals.css";

const description =
  "Type your BC address and see whether rooftop solar pays off under BC Hydro's 2026 rules.";

// The link-preview image is app/opengraph-image.png (Next's file convention); metadataBase makes its URL absolute.
export const metadata: Metadata = {
  metadataBase: new URL("https://sunscore.tech"),
  title: "Sunscore: is solar worth it on your roof?",
  description,
  openGraph: { siteName: "Sunscore", title: "Sunscore: is solar worth it on your roof?", description, type: "website" },
  twitter: { card: "summary_large_image" },
};

// Fonts are the system stack from the design tokens (globals.css), so there's nothing to load here.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
