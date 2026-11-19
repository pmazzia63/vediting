import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = "http://127.0.0.1:5178";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 5179,
    strictPort: true,
    proxy: {
      "/api": api,
      "/media": api,
      "/ws": { target: "ws://127.0.0.1:5178", ws: true },
    },
  },
});
