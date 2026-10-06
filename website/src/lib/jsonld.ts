import { absoluteUrl, site } from "@/site";
import { faq } from "./faq";

const personId = absoluteUrl("#person");
const orgId = absoluteUrl("#org");

const person = { "@type": "Person", "@id": personId, name: site.author, url: absoluteUrl() };

const organization = {
  "@type": "Organization",
  "@id": orgId,
  name: site.name,
  url: absoluteUrl(),
  logo: absoluteUrl("assets/icon-512.png"),
  founder: { "@id": personId },
};

const softwareApplication = {
  "@type": "SoftwareApplication",
  name: site.name,
  operatingSystem: site.windowsAvailable ? "macOS 14+, Windows 10, Windows 11" : "macOS 14+",
  applicationCategory: "ProductivityApplication",
  description: "A notch on the Mac or Windows screen edge that keeps your Notion pages and tasks one hover away.",
  url: absoluteUrl(),
  image: absoluteUrl("assets/icon-512.png"),
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: site.price },
  publisher: { "@id": personId },
};

const faqPage = {
  "@type": "FAQPage",
  mainEntity: faq.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
};

export const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [softwareApplication, person, organization, faqPage],
};

export const pressJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Brink press kit",
  url: absoluteUrl("press/"),
  about: {
    "@type": "SoftwareApplication",
    name: site.name,
    operatingSystem: site.windowsAvailable ? "macOS 14+, Windows 10, Windows 11" : "macOS 14+",
    applicationCategory: "ProductivityApplication",
  },
};
