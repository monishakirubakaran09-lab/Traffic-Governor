import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Standard Vite config; no Figma Make internal files required.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
  host: "localhost",
  port: 5173,

  proxy: {
    "/backend": {
      target: "http://127.0.0.1:5001",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/backend/, ""),
    },
  },
},
});
