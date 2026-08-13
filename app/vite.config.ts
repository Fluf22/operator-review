import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { operatorReviewApi } from "./server/plugin";

export default defineConfig({
  plugins: [react(), operatorReviewApi()],
  server: {
    host: "127.0.0.1",
    port: 4310,
    strictPort: true,
  },
});
