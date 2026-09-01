import type { CanvasProject } from "./types";

const DB_NAME = "site-canvas";
const STORE = "projects";
const ACTIVE_KEY = "active-project";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadProject(): Promise<CanvasProject | null> {
  const id = localStorage.getItem(ACTIVE_KEY);
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as CanvasProject) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: CanvasProject): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(project);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  localStorage.setItem(ACTIVE_KEY, project.id);
}
