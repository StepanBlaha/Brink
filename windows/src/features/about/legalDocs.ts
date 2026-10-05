import notice from "../../../../legal/NOTICE.md?raw";
import privacy from "../../../../legal/PRIVACY.md?raw";
import terms from "../../../../legal/TERMS.md?raw";

export type LegalDoc = "privacy" | "terms" | "notice";

/** The repo's `legal/*.md`, bundled into the app at build time. */
export const LEGAL: Record<LegalDoc, { title: string; text: string }> = {
  privacy: { title: "Privacy Policy", text: privacy },
  terms: { title: "Terms of Use", text: terms },
  notice: { title: "Acknowledgements", text: notice },
};

export const isLegalDoc = (v: string | undefined): v is LegalDoc => v === "privacy" || v === "terms" || v === "notice";
