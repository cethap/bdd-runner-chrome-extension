import { defineConfig } from "wxt";

// Fengari (Lua VM in JS) depends on Node.js modules through its os/io/debug
// standard libraries. We never call luaopen_os or luaopen_io, but fengari
// eagerly evaluates parts of the module tree at import time.
//
// Strategy:
// 1. Replace Node built-in modules with silent no-op stubs (no throwing Proxies)
// 2. Inject a process/Buffer shim for unguarded access in tmp/readline-sync

const nodeStubs: Record<string, string> = {
  fs: `
    export var constants = { O_CREAT: 0, O_EXCL: 0, O_RDWR: 0 };
    export function openSync() { return -1; }
    export function closeSync() {}
    export function readFileSync() { return ""; }
    export function writeFileSync() {}
    export function realpathSync(p) { return p; }
    export function realpath(p, cb) { if(cb) cb(null, p); }
    export function stat(p, cb) { if(cb) cb(new Error("ENOENT")); }
    export function statSync() { throw new Error("ENOENT"); }
    export function rmdirSync() {}
    export function rmSync() {}
    export function rm(p, o, cb) { if(cb) cb(null); }
    export function existsSync() { return false; }
    export function mkdirSync() {}
    export function unlinkSync() {}
  `,
  os: `
    export var constants = { errno: { EBADF: 9, ENOENT: 2 } };
    export function tmpdir() { return "/tmp"; }
    export function platform() { return "browser"; }
    export function homedir() { return "/"; }
    export function hostname() { return "localhost"; }
    export function type() { return "Browser"; }
    export var EOL = "\\n";
  `,
  path: `
    export function join() { return Array.from(arguments).join("/"); }
    export function resolve() { return Array.from(arguments).join("/"); }
    export function basename(p) { return p ? p.split("/").pop() || "" : ""; }
    export function dirname(p) { var i = (p||"").lastIndexOf("/"); return i >= 0 ? p.slice(0, i) : "."; }
    export var sep = "/";
    export var delimiter = ":";
  `,
  crypto: `
    export function createHash() { return { update() { return this; }, digest() { return "0"; } }; }
    export function createDecipher() { return { update() { return ""; }, final() { return ""; } }; }
  `,
  child_process: `
    export function execSync() { return ""; }
  `,
  readline: ``,
  util: `
    export function inspect(v) { return String(v); }
    export function format() { return Array.from(arguments).join(" "); }
    export function inherits() {}
    export var isArray = Array.isArray;
  `,
};

const processShimCode = `
if (typeof process === "undefined") {
  globalThis.process = {
    env: {}, pid: 0, platform: "browser",
    versions: { node: "0" },
    addListener: function() {}, removeListener: function() {},
    exit: function() {}, uptime: function() { return 0; },
    binding: function() { return { TTY: function() {} }; },
    stderr: { write: function() {} },
    stdout: { write: function() {} },
    stdin: { fd: 0 },
  };
}
if (typeof Buffer === "undefined") {
  globalThis.Buffer = { from: function(a) { return new Uint8Array(a || 0); } };
}
`;

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
  vite: () => ({
    plugins: [
      {
        name: "node-module-stubs",
        enforce: "pre" as const,
        resolveId(id: string) {
          if (id in nodeStubs) return `\0stub:${id}`;
          return null;
        },
        load(id: string) {
          if (id.startsWith("\0stub:")) {
            const mod = id.slice("\0stub:".length);
            return nodeStubs[mod] ?? "export default {};";
          }
          return null;
        },
      },
      {
        name: "fengari-process-shim",
        banner: () => processShimCode,
      },
    ],
  }),
});
