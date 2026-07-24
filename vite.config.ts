import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages project site is served from https://<user>.github.io/faecherbagger/.
// The base can be overridden at build time (e.g. for a custom domain) via BASE_PATH.
const base = process.env.BASE_PATH ?? "/faecherbagger/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "Fächerbagger – Baustellen im Blick",
        short_name: "Fächerbagger",
        description:
          "Aktuelle und geplante Straßenbaustellen in der Region Karlsruhe.",
        theme_color: "#454b6b",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        scope: ".",
        start_url: ".",
        lang: "de",
        categories: ["navigation", "utilities"],
        icons: [
          {
            src: "icons/faecherbagger-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/faecherbagger-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/faecherbagger-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
