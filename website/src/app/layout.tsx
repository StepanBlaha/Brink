import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { site } from "@/site";
import { siteIcons } from "@/lib/metadata";
import { SkipLink } from "@/components/SkipLink";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.baseUrl + "/"),
  title: { default: "Brink", template: "%s | Brink" },
  applicationName: site.name,
  authors: [{ name: site.author }],
  icons: siteIcons,
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SkipLink />
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
