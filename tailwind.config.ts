import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        bone: "#f2f0ea",
        ash: "#8f8f8b",
        panel: "#101010",
        line: "#252525",
        acid: "#baff00",
        voidBlack: "#050505",
        panelBlack: "#0f0f0f",
        inkPanel: "#171717",
        roomBorder: "#252525",
        strongBorder: "#3a3a3a",
        paperWhite: "#F2F0EA",
        mutedText: "#8f8f8b",
        acidGreen: "#baff00",
        warningOrange: "#ff5a1f",
        errorRed: "#FF3B30",
        successGreen: "#3DFF88"
      },
      fontFamily: {
        display: ["ROOM9 Display", "Arial Black", "Impact", "system-ui", "sans-serif"],
        mono: ["ROOM9 Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      fontSize: {
        "room-hero": ["clamp(4rem,8vw,8.5rem)", { lineHeight: "0.86", letterSpacing: "0" }],
        "room-display": ["clamp(3rem,5vw,6rem)", { lineHeight: "0.9", letterSpacing: "0" }],
        "room-section": ["1.75rem", { lineHeight: "1", letterSpacing: "0" }],
        "room-title": ["1.25rem", { lineHeight: "1.05", letterSpacing: "0" }],
        "room-body": ["1rem", { lineHeight: "1.7", letterSpacing: "0" }],
        "room-small": ["0.875rem", { lineHeight: "1.55", letterSpacing: "0" }],
        "room-label": ["0.6875rem", { lineHeight: "1.2", letterSpacing: "0.14em" }],
        "room-mono": ["0.75rem", { lineHeight: "1.35", letterSpacing: "0.06em" }]
      },
      spacing: {
        "room-0-5": "4px",
        "room-1": "8px",
        "room-2": "16px",
        "room-3": "24px",
        "room-4": "32px",
        "room-5": "40px",
        "room-8": "64px",
        "room-12": "96px",
        "room-page": "40px",
        "room-player": "88px",
        "room-sidebar": "248px"
      },
      maxWidth: {
        "room": "1440px",
        "room-wide": "1560px"
      },
      gridTemplateColumns: {
        "room-12": "repeat(12, minmax(0, 1fr))",
        "room-workspace": "248px minmax(0, 1fr)"
      }
    }
  },
  plugins: []
};

export default config;
