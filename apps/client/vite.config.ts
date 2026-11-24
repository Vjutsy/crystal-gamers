import { defineConfig } from "vite";

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/crystal-gamers/").
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  server: { port: 5173 },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
  },
});
