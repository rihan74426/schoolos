import plugin from "tailwindcss/plugin";

/** @type {import('tailwindcss').Config} */
const config = {
  // Colours are CSS variables (app/tokens.css), so light/dark switching needs no `dark:` variants.
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  // Legacy hand-written CSS (globals.css, admin.css) still relies on browser defaults. Turn preflight on
  // only after the last legacy class is gone.
  corePlugins: { preflight: false },
  theme: {
    screens: { xs: "420px", sm: "640px", md: "768px", lg: "1024px", xl: "1280px" },
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        fg: "var(--text)",
        "fg-muted": "var(--text-2)",
        line: "var(--border)",
        "line-strong": "var(--border-strong)",
        brand: { DEFAULT: "var(--brand)", 2: "var(--brand-2)", soft: "var(--brand-soft)" },
        ok: "var(--ok)",
        err: "var(--err)",
        warn: "var(--warn)",
      },
      borderRadius: { card: "var(--radius)" },
      boxShadow: { card: "var(--shadow)" },
      backgroundImage: { grad: "var(--grad)" },
      transitionTimingFunction: { brand: "var(--ease)" },
      fontFamily: { sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"] },
      minHeight: { tap: "44px" },
      minWidth: { tap: "44px" },
    },
  },
  plugins: [
    // Preflight is off, so Tailwind's `border` utilities would only set a width and the browser default
    // style is `none` (invisible). Re-add just the border part of preflight.
    plugin(({ addBase }) => addBase({ "*, ::before, ::after": { borderWidth: "0", borderStyle: "solid", borderColor: "var(--border)" } })),
  ],
};

export default config;
