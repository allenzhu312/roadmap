import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/roadmap/",
  root: resolve(__dirname, "github-pages"),
  publicDir: resolve(__dirname, "public"),
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: resolve(__dirname, "docs"),
  },
});
