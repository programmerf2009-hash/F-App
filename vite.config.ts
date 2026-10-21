import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages'da sayt /<repo>/ ostida joylashadi — workflow VITE_BASE beradi.
const base = process.env.VITE_BASE || "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
  },
});
