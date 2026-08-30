// FILE: collectionsStore.test.ts
// Purpose: Unit tests for the collections store actions and helpers.
// Layer: Web UI state store tests

import { ProjectId } from "@caide/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const memoryStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
})();

vi.stubGlobal("localStorage", memoryStorage);

const { collectionNamesOf, isCollectionNameValid, normalizeCollectionName, useCollectionsStore } =
  await import("./collectionsStore");
const COLLECTIONS = () => useCollectionsStore.getState().collections;

const PROJECT_ID_A = ProjectId.makeUnsafe("p-aaa");
const PROJECT_ID_B = ProjectId.makeUnsafe("p-bbb");

describe("isCollectionNameValid", () => {
  it("accepts trimmed non-empty names", () => {
    expect(isCollectionNameValid("  Apps  ")).toBe(true);
    expect(isCollectionNameValid("App")).toBe(true);
  });

  it("rejects empty and overlong names", () => {
    expect(isCollectionNameValid("   ")).toBe(false);
    expect(isCollectionNameValid("")).toBe(false);
    expect(isCollectionNameValid("x".repeat(37))).toBe(false);
  });
});

describe("normalizeCollectionName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeCollectionName("  Apps  ")).toBe("Apps");
  });
});

describe("collectionNamesOf", () => {
  it("returns sorted names", () => {
    expect(collectionNamesOf({ Zed: [], Alpha: [], Mid: [] })).toEqual(["Alpha", "Mid", "Zed"]);
  });
});

describe("collections store", () => {
  beforeEach(() => {
    useCollectionsStore.setState({ collections: {} });
  });

  it("creates a collection", () => {
    expect(useCollectionsStore.getState().createCollection("  Apps  ")).toBe(true);
    expect(Object.keys(COLLECTIONS())).toEqual(["Apps"]);
  });

  it("rejects duplicate or invalid collection names", () => {
    useCollectionsStore.getState().createCollection("Apps");
    expect(useCollectionsStore.getState().createCollection(" Apps ")).toBe(false);
    expect(useCollectionsStore.getState().createCollection("")).toBe(false);
  });

  it("adds and removes a project idempotently", () => {
    useCollectionsStore.getState().createCollection("Apps");
    useCollectionsStore.getState().addProjectToCollection("Apps", PROJECT_ID_A);
    useCollectionsStore.getState().addProjectToCollection("Apps", PROJECT_ID_A);
    expect(COLLECTIONS().Apps).toEqual([PROJECT_ID_A]);
    useCollectionsStore.getState().removeProjectFromCollection("Apps", PROJECT_ID_A);
    expect(COLLECTIONS().Apps).toEqual([]);
  });

  it("renames an existing collection", () => {
    useCollectionsStore.getState().createCollection("Apps");
    expect(useCollectionsStore.getState().renameCollection("Apps", "Products")).toBe(true);
    expect(Object.keys(COLLECTIONS())).toEqual(["Products"]);
    expect(useCollectionsStore.getState().renameCollection("Apps", "Products")).toBe(false);
  });

  it("deletes a collection", () => {
    useCollectionsStore.getState().createCollection("Apps");
    useCollectionsStore.getState().deleteCollection("Apps");
    expect(COLLECTIONS()).toEqual({});
  });

  it("prunes a project from every collection", () => {
    useCollectionsStore.getState().createCollection("A");
    useCollectionsStore.getState().createCollection("B");
    useCollectionsStore.getState().addProjectToCollection("A", PROJECT_ID_A);
    useCollectionsStore.getState().addProjectToCollection("A", PROJECT_ID_B);
    useCollectionsStore.getState().addProjectToCollection("B", PROJECT_ID_A);
    useCollectionsStore.getState().pruneProjectFromCollections(PROJECT_ID_A);
    expect(COLLECTIONS().A).toEqual([PROJECT_ID_B]);
    expect(COLLECTIONS().B).toEqual([]);
  });

  it("addProjectToCollection ignores unknown collections", () => {
    useCollectionsStore.getState().addProjectToCollection("Nope", PROJECT_ID_A);
    expect(COLLECTIONS()).toEqual({});
  });

  it("pruneProjectFromCollections leaves untouched state unchanged", () => {
    useCollectionsStore.getState().createCollection("A");
    const before = COLLECTIONS();
    useCollectionsStore.getState().pruneProjectFromCollections(PROJECT_ID_A);
    expect(COLLECTIONS()).toEqual(before);
  });
});
