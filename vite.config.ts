import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const api = `http://${env.HOST || "127.0.0.1"}:${env.PORT || 4700}`;
  return {
    root: "web",
    envDir: "..",
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@shared": fileURLToPath(new URL("./shared", import.meta.url)) } },
    server: {
      host: "127.0.0.1",
      port: 5174, // 5173 is taken by relaunch-radar's Vite
      strictPort: true,
      proxy: {
        "/api": { target: api, changeOrigin: false },
        "/auth": { target: api, changeOrigin: false },
      },
      fs: { allow: [".."] }, // widgets/*/Widget.tsx live outside the web root
    },
    build: { outDir: "../dist/web", emptyOutDir: true },
  };
});
