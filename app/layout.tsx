import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nomadeezee Map Platform",
  description: "Versioned basemap and geographic data platform for Nomadeezee.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
