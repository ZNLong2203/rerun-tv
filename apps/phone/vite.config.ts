import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served by the Rerun server under /m/. In development, Vite proxies the API
// and the pairing socket to the server on :8787.
export default defineConfig({
  base: "/m/",
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      "/api": "http://localhost:8787",
      "/media": "http://localhost:8787",
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
});
