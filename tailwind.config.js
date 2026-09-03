/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // xs 미정의로 헤더 "OriPics" 워드마크가 항상 숨겨지던 버그 수정 (2026-08-18)
      screens: {
        xs: "400px",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // iOS 시스템 팔레트로 액션 파랑·위험 빨강 통일 (2026-09-03 대표 결정 — 앱과 동일 계열).
        // 600=iOS 기본(#007AFF/#FF3B30), 500=hover(밝게), 700=active(어둡게). 흰 배경 대비 4.0:1/3.5:1 — 대표 승인.
        blue: {
          50: "#F0F7FF", 100: "#E0EFFF", 200: "#BFDDFF", 300: "#8FC3FF", 400: "#4DA3FF",
          500: "#1F8CFF", 600: "#007AFF", 700: "#0066D6", 800: "#0052AD", 900: "#003D80",
        },
        red: {
          50: "#FFF3F2", 100: "#FFE5E3", 200: "#FFC9C6", 300: "#FFA39E", 400: "#FF7B74",
          500: "#FF5A50", 600: "#FF3B30", 700: "#E0261C", 800: "#B81C14", 900: "#8F150F",
        },
      },
    },
  },
  plugins: [],
};
