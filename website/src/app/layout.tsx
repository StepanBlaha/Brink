import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { site } from "@/site";
import { siteIcons } from "@/lib/metadata";
import { SkipLink } from "@/components/SkipLink";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MotionRoot } from "@/components/MotionRoot";
import { SmoothScroll } from "@/components/SmoothScroll";
import "locomotive-scroll/dist/locomotive-scroll.css";
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
        <noscript>
          <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
        </noscript>
        <MotionRoot>
          <SmoothScroll>
            <SkipLink />
            <Header />
            <main id="main">{children}</main>
            <Footer />
          </SmoothScroll>
        </MotionRoot>
      </body>
    </html>
  );
}
