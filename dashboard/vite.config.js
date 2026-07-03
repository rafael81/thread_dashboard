import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "dashboard",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3131",
    },
  },
});
