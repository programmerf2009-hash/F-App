import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { OfflineNotice } from "./app/OfflineNotice";
import "./styles/globals.css";
import "./styles/surfaces.css";
import "./styles/hardening.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary label="app">
      <App />
    </ErrorBoundary>
    <OfflineNotice />
  </StrictMode>,
);
