"use client";

import { useServerInsertedHTML } from "next/navigation";

// Enforces light mode only: removes any dark class that might have been cached in the browser.
const themeInit = `(function(){try{document.documentElement.classList.remove("dark");try{localStorage.setItem("caide-theme","light")}catch(e){}}catch(e){}})()`;

export function ThemeScript() {
  useServerInsertedHTML(() => (
    <script id="caide-theme-init" dangerouslySetInnerHTML={{ __html: themeInit }} />
  ));
  return null;
}
