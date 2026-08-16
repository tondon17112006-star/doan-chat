// File: client/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const devPort = Number(process.env.VITE_PORT || 5173);
const apiProxyTarget = process.env.VITE_PROXY_TARGET || "http://localhost:5000";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["lumina-mark.svg"],
      manifest: {
        name: "Lumina Chat",
        short_name: "Lumina",
        description: "A calm place for all your conversations.",
        theme_color: "#f4f5f8",
        background_color: "#f4f5f8",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/pwa-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "lumina-images", expiration: { maxEntries: 60, maxAgeSeconds: 2592000 } }
          }
        ]
      }
    })
  ],
  server: {
    port: devPort,
    strictPort: true,
    proxy: {
      "/api": { target: apiProxyTarget, changeOrigin: true },
      "/uploads": { target: apiProxyTarget, changeOrigin: true },
      "/socket.io": { target: apiProxyTarget, ws: true }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("emoji-picker-react")) return "vendor-emoji";
          if (id.includes("react-icons")) return "vendor-icons";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (
            id.includes("@tanstack") ||
            id.includes("axios") ||
            id.includes("socket.io-client") ||
            id.includes("zustand")
          ) {
            return "vendor-data";
          }
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("react-router")
          ) {
            return "vendor-react";
          }
          return undefined;
        }
      }
    }
  }
});
