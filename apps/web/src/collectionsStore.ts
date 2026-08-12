// FILE: collectionsStore.ts
// Purpose: Persists named project collections (History cards can be filed into one or more
//          collections; collections themselves can be created/renamed/deleted).
// Layer: Web UI state store

import type { ProjectId } from "@caide/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const MAX_COLLECTION_NAME_LENGTH = 36;

interface CollectionsStoreState {
  /** Collection name → ordered project ids in that collection. */
  collections: Record<string, ProjectId[]>;
  createCollection: (name: string) => boolean;
  renameCollection: (oldName: string, newName: string) => boolean;
  deleteCollection: (name: string) => void;
  addProjectToCollection: (collectionName: string, projectId: ProjectId) => void;
  removeProjectFromCollection: (collectionName: string, projectId: ProjectId) => void;
  /** Drop the project from every collection (used when a project is deleted). */
  pruneProjectFromCollections: (projectId: ProjectId) => void;
}

const COLLECTIONS_STORAGE_KEY = "caide:collections:v1";

export function isCollectionNameValid(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_COLLECTION_NAME_LENGTH;
}

export function normalizeCollectionName(name: string): string {
  return name.trim();
}

export const useCollectionsStore = create<CollectionsStoreState>()(
  persist(
    (set, get) => ({
      collections: {},
      createCollection: (name) => {
        const normalized = normalizeCollectionName(name);
        if (!isCollectionNameValid(normalized) || get().collections[normalized]) return false;
        set((state) => ({ collections: { ...state.collections, [normalized]: [] } }));
        return true;
      },
      renameCollection: (oldName, newName) => {
        const normalized = normalizeCollectionName(newName);
        const entries = get().collections;
        const existing = entries[oldName];
        if (existing === undefined) return false;
        if (!isCollectionNameValid(normalized) || (normalized !== oldName && entries[normalized]))
          return false;
        set((state) => {
          const { [oldName]: _removed, ...rest } = state.collections;
          return { collections: { ...rest, [normalized]: existing } };
        });
        return true;
      },
      deleteCollection: (name) => {
        set((state) => {
          if (!state.collections[name]) return state;
          const { [name]: _removed, ...rest } = state.collections;
          return { collections: rest };
        });
      },
      addProjectToCollection: (collectionName, projectId) => {
        set((state) => {
          const members = state.collections[collectionName];
          if (members === undefined || members.includes(projectId)) return state;
          return {
            collections: { ...state.collections, [collectionName]: [...members, projectId] },
          };
        });
      },
      removeProjectFromCollection: (collectionName, projectId) => {
        set((state) => {
          const members = state.collections[collectionName];
          if (members === undefined || !members.includes(projectId)) return state;
          return {
            collections: {
              ...state.collections,
              [collectionName]: members.filter((id) => id !== projectId),
            },
          };
        });
      },
      pruneProjectFromCollections: (projectId) => {
        set((state) => {
          let changed = false;
          const next: Record<string, ProjectId[]> = {};
          for (const [name, members] of Object.entries(state.collections)) {
            const filtered = members.filter((id) => id !== projectId);
            if (filtered.length !== members.length) changed = true;
            next[name] = filtered;
          }
          if (!changed) return state;
          return { collections: next };
        });
      },
    }),
    {
      name: COLLECTIONS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function collectionNamesOf(collections: Record<string, ProjectId[]>): string[] {
  return Object.keys(collections).sort((a, b) => a.localeCompare(b));
}
