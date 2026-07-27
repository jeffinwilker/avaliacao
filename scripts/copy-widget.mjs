// Copia o bundle do widget para a pasta public do admin,
// para que o Next sirva o arquivo estaticamente em /widget/avaliacoes-widget.js
import { mkdir, copyFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Modo library do Vite grava em dist/ (não dist-dev/)
const src = resolve(root, "apps/widget/dist/avaliacoes-widget.js");
const destDir = resolve(root, "apps/admin/public/widget");
const dest = resolve(destDir, "avaliacoes-widget.js");

try {
  await access(src);
} catch {
  console.error(`[copy-widget] Arquivo não encontrado: ${src}`);
  console.error(
    `[copy-widget] Rode 'npm run build:widget' antes ou use 'npm run build'.`
  );
  process.exit(1);
}

await mkdir(destDir, { recursive: true });
await copyFile(src, dest);
console.log(`[copy-widget] ${src} → ${dest}`);
