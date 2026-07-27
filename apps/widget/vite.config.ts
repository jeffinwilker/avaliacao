import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const isLibrary = mode === "library";

  return {
    plugins: [react()],

    // Modo dev: SPA normal com index.html para desenvolvimento
    // Modo library: bundle único auto-mountable
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
