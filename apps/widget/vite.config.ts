import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(() => {
  return {
    plugins: [react()],

    // O bundle é embarcado em sites de terceiros. Muitas libs (incluindo
    // React em modo dev) referenciam `process.env.NODE_ENV`. Como o browser
    // não tem `process`, substituímos essas referências estaticamente aqui.
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env": "{}",
      global: "globalThis",
    },

    build: {
      lib: {
        entry: resolve(__dirname, "src/embed.tsx"),
        name: "AvaliacoesWidget",
        fileName: () => "avaliacoes-widget.js",
        formats: ["iife"],
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          assetFileNames: "avaliacoes-widget.[ext]",
        },
      },
      cssCodeSplit: false,
      emptyOutDir: true,
      target: "es2018",
      minify: "esbuild",
    },

    server: {
      port: 5173,
    },
  };
});
