import type { FeatureFile } from "@/lib/store/slices/files-slice";

const STORAGE_KEY = "gherkin_features";

function generateId(): string {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadFeatureFiles(): Promise<FeatureFile[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return (data[STORAGE_KEY] as FeatureFile[] | undefined) ?? [];
}

export async function saveFeatureFile(
  name: string,
  content: string,
  existingId?: string,
): Promise<FeatureFile> {
  const files = await loadFeatureFiles();
  const now = Date.now();

  if (existingId) {
    const index = files.findIndex((f) => f.id === existingId);
    if (index >= 0) {
      files[index] = { ...files[index]!, name, content, updatedAt: now };
      await chrome.storage.local.set({ [STORAGE_KEY]: files });
      return files[index]!;
    }
  }

  const file: FeatureFile = {
    id: generateId(),
    name,
    content,
    createdAt: now,
    updatedAt: now,
  };

  files.push(file);
  await chrome.storage.local.set({ [STORAGE_KEY]: files });
  return file;
}

export async function deleteFeatureFile(id: string): Promise<void> {
  const files = await loadFeatureFiles();
  const filtered = files.filter((f) => f.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

export async function renameFeatureFile(
  id: string,
  newName: string,
): Promise<void> {
  const files = await loadFeatureFiles();
  const file = files.find((f) => f.id === id);
  if (file) {
    file.name = newName;
    file.updatedAt = Date.now();
    await chrome.storage.local.set({ [STORAGE_KEY]: files });
  }
}
