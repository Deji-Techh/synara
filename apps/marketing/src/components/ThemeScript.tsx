"use client";

import { useServerInsertedHTML } from "next/navigation";

const THEME_KEY = "caide-theme";

const themeInit = `(function(){try{var d=document.documentElement;var K=${JSON.stringify(THEME_KEY)};function stored(){try{return localStorage.getItem(K)}catch(e){return null}}function apply(){var t=stored();var dark=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d.classList.contains('dark')!==dark)d.classList.toggle('dark',dark)}apply();window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(){if(!stored())apply()});if(!window.__caideThemeObserver){window.__caideThemeObserver=new MutationObserver(function(){setTimeout(apply,0)});window.__caideThemeObserver.observe(d,{attributes:true,attributeFilter:['class']})}window.addEventListener('load',function(){setTimeout(apply,0)});setTimeout(apply,300)}catch(e){}})()`;

export function ThemeScript() {
  useServerInsertedHTML(() => (
    <script id="caide-theme-init" dangerouslySetInnerHTML={{ __html: themeInit }} />
  ));
  return null;
}
