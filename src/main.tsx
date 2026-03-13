import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import AppLoading from "./components/AppLoading.tsx";
import "./i18n/config";
import "./index.css";
import { initializeTheme } from "./lib/theme";

initializeTheme();

createRoot(document.getElementById("root")!).render(
  <Suspense fallback={<AppLoading variant="fullScreen" label="Cargando" />}>
    <App />
  </Suspense>
);
