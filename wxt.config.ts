import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Gherkin BDD Runner",
    description: "Gherkin editor with Karate-style HTTP execution",
    version: "0.1.0",
    permissions: ["sidePanel", "storage"],
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "Open Gherkin Runner",
    },
    side_panel: {
      default_path: "sidepanel/index.html",
    },
  },
});
