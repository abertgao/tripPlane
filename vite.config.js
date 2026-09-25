import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 8802,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8812,
    strictPort: true,
    allowedHosts: true,
  },
});
