import { FAQ_ITEMS } from "@/data/faqs";
import {
  PRODUCT_CATEGORY,
  PRODUCT_META_DESCRIPTION,
  PRODUCT_NAME,
  PRODUCT_DESCRIPTION,
} from "@/data/product";

export const SITE_URL = "https://caide.dev";
export const SITE_NAME = PRODUCT_NAME;

export const CREATOR_NAME = "Caide Team";
export const CREATOR_URL = "https://caide.dev";
export const GITHUB_REPO_URL = "https://github.com/Deji-Techh/synara";
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
export const GITHUB_SPONSORS_URL = `${GITHUB_REPO_URL}/sponsors`;
export const X_PROFILE_URL = "https://x.com/orgcaide";

export const SITE_TITLE = `${SITE_NAME} — Local-First AI App Builder for React Native, Flutter & Web`;
export const SITE_DESCRIPTION = PRODUCT_META_DESCRIPTION;

export const SEO_KEYWORDS = [
  "Caide",
  "AI app builder",
  "local-first AI workspace",
  "React Native AI IDE",
  "Flutter AI builder",
  "Expo mobile app builder",
  "Claude 3.7 Sonnet coding",
  "OpenAI o3-mini",
  "DeepSeek R1",
  "bring your own key AI",
  "free AI coding assistant",
  "App Blueprints",
  "LiveLab preview",
  "DeviceLab simulator",
  "Neon database branching",
  "Supabase AI studio",
  "open source AI IDE",
  "desktop developer tools",
];

export const OG_IMAGE = {
  url: "/hero-bg.jpg",
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — ${PRODUCT_CATEGORY}`,
};

export const SITE_IMAGES = {
  icon: "/icon.png",
  og: "/hero-bg.jpg",
};

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export function jsonLdScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export const SITE_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-US",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: SITE_NAME,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Linux, Windows",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      description: PRODUCT_DESCRIPTION,
    },
  ],
};

export const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};
