import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages'da sayt /<repo>/ ostida joylashadi — workflow VITE_BASE beradi.
const base = process.env.VITE_BASE || "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // React and Supabase rarely change; keeping them in their own chunks
        // makes repeat visits cheaper and keeps the app chunk under the limit.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("react") || id.includes("scheduler")) return "vendor-react";
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5174,
    host: true,
  },
});
