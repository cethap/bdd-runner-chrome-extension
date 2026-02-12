import type { LuaScript } from "@/lib/lua/types";

const STORAGE_KEY = "gherkin_lua_scripts";

function generateId(): string {
  return `lua_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadLuaScripts(): Promise<LuaScript[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return (data[STORAGE_KEY] as LuaScript[] | undefined) ?? [];
}

export async function saveLuaScript(
  name: string,
  code: string,
  existingId?: string,
): Promise<LuaScript> {
  const scripts = await loadLuaScripts();
  const now = Date.now();

  if (existingId) {
    const index = scripts.findIndex((s) => s.id === existingId);
    if (index >= 0) {
      scripts[index] = { ...scripts[index]!, name, code, updatedAt: now };
      await chrome.storage.local.set({ [STORAGE_KEY]: scripts });
      return scripts[index]!;
    }
  }

  const script: LuaScript = {
    id: generateId(),
    name,
    code,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  scripts.push(script);
  await chrome.storage.local.set({ [STORAGE_KEY]: scripts });
  return script;
}

export async function deleteLuaScript(id: string): Promise<void> {
  const scripts = await loadLuaScripts();
  const filtered = scripts.filter((s) => s.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

export async function toggleLuaScript(id: string, enabled: boolean): Promise<void> {
  const scripts = await loadLuaScripts();
  const script = scripts.find((s) => s.id === id);
  if (script) {
    script.enabled = enabled;
    script.updatedAt = Date.now();
    await chrome.storage.local.set({ [STORAGE_KEY]: scripts });
  }
}
