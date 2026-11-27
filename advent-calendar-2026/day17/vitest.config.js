import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // happy-dom: Node の上で動く DOM。document や customElements が使えるようになる
    environment: "happy-dom",
    include: ["tests/**/*.test.js"],
  },
});
