import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import AppLoading from "./components/AppLoading.tsx";
import "./i18n/config";
import "./index.css";
import { initializeTheme } from "./lib/theme";

const APP_DEPLOY_INFO = {
  version: "1.0.0",
  deployedAt: "2026-04-20 19:46 Europe/Madrid"
} as const;

initializeTheme();

console.info(
  `[deploy] Iberica Oposiciones v${APP_DEPLOY_INFO.version} - ${APP_DEPLOY_INFO.deployedAt}`
);

createRoot(document.getElementById("root")!).render(
  <Suspense fallback={<AppLoading variant="fullScreen" label="Cargando" />}>
    <App />
  </Suspense>
);
