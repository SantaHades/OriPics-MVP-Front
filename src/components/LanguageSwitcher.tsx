"use client";

import { useLocale } from "next-intl";
import { useRouter } from "@/navigation";
import { usePathname } from "next/navigation";
import { Globe } from "lucide-react";
import { useState, useRef, useEffect } from "react";

const languages = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
] as const;

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const fullPathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Get pathname without locale prefix
  const pathnameWithoutLocale = fullPathname.replace(new RegExp(`^/(${languages.map(l => l.code).join('|')})`), "") || "/";


  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentLang = languages.find((l) => l.code === locale) || languages[0];

  const switchLocale = (code: string) => {
    console.log("Switching to:", code, "Original path:", fullPathname, "Cleaned path:", pathnameWithoutLocale);
    router.replace(pathnameWithoutLocale, { locale: code as any });
    setOpen(false);
  };



  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-slate-100 transition-all text-slate-500 hover:text-slate-900"
        title="Language"
      >
        <Globe size={16} />
        <span className="text-xl font-medium">{currentLang.flag}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-40 rounded-xl overflow-hidden border border-slate-200 bg-white/95 backdrop-blur-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => switchLocale(lang.code)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                locale === lang.code
                  ? "bg-blue-50 text-blue-600 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="text-lg">{lang.flag}</span>
              <span>{lang.label}</span>
              {locale === lang.code && (
                <span className="ml-auto text-blue-600 text-xs">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
