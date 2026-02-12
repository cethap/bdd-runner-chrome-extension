import { IpcServer } from "@/lib/ipc/server";

export default defineBackground(() => {
  // Open side panel when extension icon is clicked
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Initialize IPC server
  const server = new IpcServer();
  server.listen();

  console.log("[Gherkin BDD] Background service worker initialized");
});
