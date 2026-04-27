import react from "@vitejs/plugin-react-swc";
import { componentTagger } from "lovable-tagger";
import { readFileSync } from "node:fs";
import path from "path";
import { defineConfig } from "vite";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
) as { version?: string };
const appVersion = packageJson.version ?? "0.0.0";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    chunkSizeWarningLimit: 1200,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("react-pdf") || id.includes("pdfjs-dist"))
            return "pdf-viewer";

          if (id.includes("@xyflow/react")) return "mind-map";

          if (id.includes("recharts")) return "charts";

          if (id.includes("react-markdown")) return "markdown";

          if (id.includes("node_modules")) return "vendor";
        }
      }
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false
    }
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(
    Boolean
  ),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
}));
