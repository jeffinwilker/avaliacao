import React from "react";
import ReactDOM from "react-dom/client";
import { Widget } from "./Widget";
import "./styles.css";

const mountNode = document.getElementById("avaliacoes-widget");

if (mountNode) {
  const productId = mountNode.dataset.productId ?? "demo-product";
  const storeKey = mountNode.dataset.storeKey ?? "demo-store-key";
  const token = new URLSearchParams(window.location.search).get("av-token") ?? undefined;

  ReactDOM.createRoot(mountNode).render(
    <React.StrictMode>
      <Widget
        apiKey={storeKey}
        externalProductId={productId}
        token={token}
      />
    </React.StrictMode>
  );
}
