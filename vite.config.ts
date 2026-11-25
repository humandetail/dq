import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  assetsInclude: ["**/*.mdx", "**/*.blp"],
  build: {
    rollupOptions: { input: ["index.html", "m2.html"] },
  },
});
