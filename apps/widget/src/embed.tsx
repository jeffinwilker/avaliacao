import React from "react";
import ReactDOM from "react-dom/client";
import { Widget } from "./Widget";
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

  // Aceita dois seletores: [data-avaliacoes] (moderno) e #avaliacoes-widget (legado)
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
