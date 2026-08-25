import React from "react";
import ReactDOM from "react-dom/client";
import { Widget } from "./Widget";
import { WidgetSummary } from "./WidgetSummary";
import { WidgetKit } from "./WidgetKit";
import { WidgetKitContents } from "./WidgetKitContents";
import { WidgetReels } from "./WidgetReels";
import {
  fetchStatsBatch,
  fetchKitsBatch,
  fetchKitContents,
  fetchReelsBatch,
} from "./lib/api";
import css from "./styles.css?inline";

// ----------------------------------------------------------------------------
// Entry point do bundle library (avaliacoes-widget.js).
// Auto-mount: procura por containers na página e renderiza um widget em cada.
//
// Como usar (no tema da Nuvemshop):
//   <div data-avaliacoes data-product-id="{{ product.id }}"></div>
//   <script src="https://seu-cdn/avaliacoes-widget.js" data-store-key="..."></script>
// ----------------------------------------------------------------------------

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const tag = document.createElement("style");
  tag.setAttribute("data-avaliacoes", "");
  tag.textContent = css as unknown as string;
  document.head.appendChild(tag);
}

function findStoreKey(): string | null {
  // procura no próprio <script src=".../avaliacoes-widget.js" data-store-key="...">
  const scripts = document.querySelectorAll<HTMLScriptElement>("script[data-store-key]");
  for (const s of Array.from(scripts)) {
    const key = s.dataset.storeKey;
    if (key) return key;
  }
  return null;
}

function mountAll() {
  injectStyles();

  const storeKey = findStoreKey();
  if (!storeKey) {
    console.warn("[avaliacoes] data-store-key não encontrado no script tag.");
    return;
  }

  const tokenFromUrl =
    new URLSearchParams(window.location.search).get("av-token") ?? undefined;

  // Widget completo: [data-avaliacoes] (moderno) e #avaliacoes-widget (legado)
  const containers = document.querySelectorAll<HTMLElement>(
    "[data-avaliacoes], #avaliacoes-widget"
  );

  containers.forEach((container) => {
    if (container.dataset.avMounted === "1") return;
    container.dataset.avMounted = "1";

    const productId =
      container.dataset.productId ?? container.getAttribute("data-product-id");
    if (!productId) {
      console.warn("[avaliacoes] container sem data-product-id", container);
      return;
    }

    const brandColor = container.dataset.brandColor;
    const maxMediaAttr = container.dataset.maxMedia;
    const maxMedia = maxMediaAttr ? Number(maxMediaAttr) : undefined;

    ReactDOM.createRoot(container).render(
      <React.StrictMode>
        <Widget
          apiKey={storeKey}
          externalProductId={productId}
          token={tokenFromUrl}
          brandColor={brandColor}
          maxMedia={maxMedia}
        />
      </React.StrictMode>
    );
  });

  // Mini-widget de summary: [data-avaliacoes-summary]
  // Faz batch fetch de TODOS os stats de uma vez pra evitar N requests
  // em páginas de vitrine/categoria.
  mountSummaries(storeKey);

  // Cards de kit: [data-avaliacoes-kit]
  mountKits(storeKey);
  mountReels(storeKey);

  // Lista "Produtos do kit" na página do kit: [data-avaliacoes-kit-items]
  mountKitContents(storeKey);
}

async function mountReels(storeKey: string) {
  const containers = document.querySelectorAll<HTMLElement>(
    "[data-avaliacoes-reels]"
  );
  if (containers.length === 0) return;

  const toMount: { el: HTMLElement; productId: string }[] = [];
  const idSet = new Set<string>();
  containers.forEach((el) => {
    if (el.dataset.avMounted === "1") return;
    const productId =
      el.dataset.productId ?? el.getAttribute("data-product-id") ?? "";
    if (!productId) {
      console.warn("[avaliacoes-reels] container sem data-product-id", el);
      return;
    }
    toMount.push({ el, productId });
    idSet.add(productId);
  });
  if (toMount.length === 0) return;

  const reelsMap = await fetchReelsBatch(storeKey, Array.from(idSet));

  for (const { el, productId } of toMount) {
    el.dataset.avMounted = "1";
    const reels = reelsMap[productId] ?? [];
    if (reels.length === 0) continue;
    const brandColor = el.dataset.brandColor;
    const title = el.dataset.title;

    ReactDOM.createRoot(el).render(
      <React.StrictMode>
        <WidgetReels reels={reels} brandColor={brandColor} title={title} />
      </React.StrictMode>
    );
  }
}

async function mountKitContents(storeKey: string) {
  const containers = document.querySelectorAll<HTMLElement>(
    "[data-avaliacoes-kit-items]"
  );
  containers.forEach(async (el) => {
    if (el.dataset.avMounted === "1") return;
    el.dataset.avMounted = "1";
    const productId =
      el.dataset.productId ?? el.getAttribute("data-product-id") ?? "";
    if (!productId) return;

    const data = await fetchKitContents(storeKey, productId);
    if (!data) return; // não é um kit → não renderiza nada

    const brandColor = el.dataset.brandColor;
    const title = el.dataset.title;
    ReactDOM.createRoot(el).render(
      <React.StrictMode>
        <WidgetKitContents
          items={data.items}
          brandColor={brandColor}
          title={title}
        />
      </React.StrictMode>
    );
  });
}

async function mountKits(storeKey: string) {
  const containers = document.querySelectorAll<HTMLElement>(
    "[data-avaliacoes-kit]"
  );
  if (containers.length === 0) return;

  const toMount: { el: HTMLElement; productId: string }[] = [];
  const idSet = new Set<string>();
  containers.forEach((el) => {
    if (el.dataset.avMounted === "1") return;
    const pid =
      el.dataset.productId ?? el.getAttribute("data-product-id") ?? "";
    if (!pid) {
      console.warn("[avaliacoes-kit] container sem data-product-id", el);
      return;
    }
    toMount.push({ el, productId: pid });
    idSet.add(pid);
  });
  if (toMount.length === 0) return;

  const kitsMap = await fetchKitsBatch(storeKey, Array.from(idSet));

  for (const { el, productId } of toMount) {
    el.dataset.avMounted = "1";
    const kits = kitsMap[productId] ?? [];
    if (kits.length === 0) continue; // sem kit → não renderiza nada
    const brandColor = el.dataset.brandColor;
    const title = el.dataset.title;

    ReactDOM.createRoot(el).render(
      <React.StrictMode>
        <WidgetKit kits={kits} brandColor={brandColor} title={title} />
      </React.StrictMode>
    );
  }
}

async function mountSummaries(storeKey: string) {
  const containers = document.querySelectorAll<HTMLElement>(
    "[data-avaliacoes-summary]"
  );
  if (containers.length === 0) return;

  // Coleta product IDs únicos ainda não montados
  const toMount: { el: HTMLElement; productId: string }[] = [];
  const idSet = new Set<string>();
  containers.forEach((el) => {
    if (el.dataset.avMounted === "1") return;
    const pid =
      el.dataset.productId ?? el.getAttribute("data-product-id") ?? "";
    if (!pid) {
      console.warn("[avaliacoes-summary] container sem data-product-id", el);
      return;
    }
    toMount.push({ el, productId: pid });
    idSet.add(pid);
  });

  if (toMount.length === 0) return;

  // Batch fetch de stats para todos os produtos visíveis
  const statsMap = await fetchStatsBatch(storeKey, Array.from(idSet));

  // Renderiza cada summary com stats pré-carregados
  for (const { el, productId } of toMount) {
    el.dataset.avMounted = "1";
    const brandColor = el.dataset.brandColor;
    const target = el.dataset.target;
    // initialStats = null quando o produto existe mas sem reviews aprovadas
    const initialStats = statsMap[productId] ?? null;

    ReactDOM.createRoot(el).render(
      <React.StrictMode>
        <WidgetSummary
          apiKey={storeKey}
          externalProductId={productId}
          brandColor={brandColor}
          target={target}
          initialStats={initialStats}
        />
      </React.StrictMode>
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountAll);
} else {
  mountAll();
}

// Permite remontar após navegação SPA (alguns temas Nuvemshop usam pjax)
(window as unknown as { AvaliacoesWidget: { mount: () => void } }).AvaliacoesWidget = {
  mount: mountAll,
};
