import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f5f7",
          100: "#e5e5ea",
          500: "#6b7280",
          900: "#111827",
        },
      },
    },
  },
} satisfies Config;
