import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./i18n/config";
import "./index.css";
import { initializeTheme } from "./lib/theme";

initializeTheme();

createRoot(document.getElementById("root")!).render(
  <Suspense fallback={null}>
    <App />
  </Suspense>
);
