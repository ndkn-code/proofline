import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "app",
  plugins: [react(), tailwindcss()],
  server: { port: 3010, strictPort: true, fs: { allow: [root] } },
  preview: { port: 3010, strictPort: true },
  build: { outDir: "../dist", emptyOutDir: true },
});
