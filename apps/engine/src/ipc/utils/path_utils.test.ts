import { safeJoin } from "@/ipc/utils/path_utils";
import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

describe("safeJoin", () => {
  const testBaseDir = "/app/workspace";
  const testBaseDirWindows = "C:\\app\\workspace";

  describe("safe paths", () => {
    it("should join simple relative paths", () => {
      const result = safeJoin(testBaseDir, "src", "components", "Button.tsx");
      expect(result).toBe(
        path.join(testBaseDir, "src", "components", "Button.tsx"),
      );
    });

    it("should handle single file names", () => {
      const result = safeJoin(testBaseDir, "package.json");
      expect(result).toBe(path.join(testBaseDir, "package.json"));
    });

    it("should handle nested directories", () => {
      const result = safeJoin(testBaseDir, "src/pages/home/index.tsx");
      expect(result).toBe(path.join(testBaseDir, "src/pages/home/index.tsx"));
    });

    it("should handle paths with dots in filename", () => {
      const result = safeJoin(testBaseDir, "config.test.js");
      expect(result).toBe(path.join(testBaseDir, "config.test.js"));
    });

    it("should handle empty path segments", () => {
      const result = safeJoin(testBaseDir, "", "src", "", "file.ts");
      expect(result).toBe(path.join(testBaseDir, "", "src", "", "file.ts"));
    });

    it("should handle multiple path segments", () => {
      const result = safeJoin(testBaseDir, "a", "b", "c", "d", "file.txt");
      expect(result).toBe(
        path.join(testBaseDir, "a", "b", "c", "d", "file.txt"),
      );
    });

    it("should work with actual temp directory", () => {
      const tempDir = os.tmpdir();
      const result = safeJoin(tempDir, "test", "file.txt");
      expect(result).toBe(path.join(tempDir, "test", "file.txt"));
    });

    it("should handle Windows-style relative paths with backslashes", () => {
      const result = safeJoin(testBaseDir, "src\\components\\Button.tsx");
      // safeJoin normalizes backslashes to forward slashes
      expect(toPosixPath(result)).toBe(
        "/app/workspace/src/components/Button.tsx",
      );
    });

    it("should handle mixed forward/backslashes in relative paths", () => {
      const result = safeJoin(testBaseDir, "src/components\\ui/button.tsx");
      // safeJoin normalizes backslashes to forward slashes
      expect(toPosixPath(result)).toBe(
        "/app/workspace/src/components/ui/button.tsx",
      );
    });

    it("should handle Windows-style nested directories", () => {
      const result = safeJoin(
        testBaseDir,
        "pages\\home\\components\\index.tsx",
      );
      // safeJoin normalizes backslashes to forward slashes
      expect(toPosixPath(result)).toBe(
        "/app/workspace/pages/home/components/index.tsx",
      );
    });

    it("should handle relative paths starting with dot and backslash", () => {
      const result = safeJoin(testBaseDir, ".\\src\\file.txt");
      // safeJoin normalizes backslashes to forward slashes
      expect(toPosixPath(result)).toBe("/app/workspace/src/file.txt");
    });
  });

  describe("paths outside the base directory", () => {
    it("resolves simple parent directory traversal (reads outside the project are allowed)", () => {
      expect(safeJoin(testBaseDir, "../outside.txt")).toBe(
        path.join(testBaseDir, "..", "outside.txt"),
      );
    });

    it("resolves multiple parent directory traversals", () => {
      expect(safeJoin(testBaseDir, "../../etc/passwd")).toBe(
        path.join(testBaseDir, "..", "..", "etc", "passwd"),
      );
    });

    it("resolves complex traversal paths", () => {
      expect(safeJoin(testBaseDir, "src/../../../etc/passwd")).toBe(
        path.join(testBaseDir, "..", "..", "etc", "passwd"),
      );
    });

    it("resolves traversal to a sibling with the same path prefix", () => {
      expect(safeJoin("/app/workspace", "../workspace-2/file.txt")).toBe(
        path.join("/", "app", "workspace-2", "file.txt"),
      );
    });

    it("resolves mixed traversal with valid components", () => {
      expect(
        safeJoin(
          testBaseDir,
          "src",
          "components",
          "..",
          "..",
          "..",
          "outside.txt",
        ),
      ).toBe(path.join(testBaseDir, "..", "outside.txt"));
    });

    it("resolves absolute Unix paths as-is", () => {
      expect(safeJoin(testBaseDir, "/etc/passwd")).toBe(
        path.resolve("/etc/passwd"),
      );
    });

    it("throws on Windows drive absolute paths (invalid or cross-drive)", () => {
      expect(() =>
        safeJoin(testBaseDir, "C:\\Windows\\System32\\config"),
      ).toThrow(/would escape the base directory/);
    });

    it("resolves Windows UNC paths as absolute paths", () => {
      const result = safeJoin(testBaseDir, "\\\\server\\share\\file.txt");
      expect(path.isAbsolute(result)).toBe(true);
    });

    it("expands home directory shortcuts and resolves them", () => {
      expect(safeJoin(testBaseDir, "~/secrets.txt")).toBe(
        path.join(os.homedir(), "secrets.txt"),
      );
    });
  });

  describe("edge cases", () => {
    it("should handle Windows-style base paths", () => {
      const result = safeJoin(testBaseDirWindows, "src", "file.txt");
      expect(result).toBe(path.join(testBaseDirWindows, "src", "file.txt"));
    });

    it("resolves Windows-style traversal from a Unix base", () => {
      expect(safeJoin(testBaseDir, "..\\..\\file.txt")).toBe(
        path.join(testBaseDir, "..", "..", "file.txt"),
      );
    });

    it("should handle current directory references safely", () => {
      const result = safeJoin(testBaseDir, "./src/file.txt");
      expect(result).toBe(path.join(testBaseDir, "./src/file.txt"));
    });

    it("should handle nested current directory references", () => {
      const result = safeJoin(testBaseDir, "src/./components/./Button.tsx");
      expect(result).toBe(
        path.join(testBaseDir, "src/./components/./Button.tsx"),
      );
    });

    it("resolves current-dir plus traversal escapes", () => {
      expect(safeJoin(testBaseDir, "./../../outside.txt")).toBe(
        path.join(testBaseDir, "..", "..", "outside.txt"),
      );
    });

    it("should handle very long paths safely", () => {
      const longPath = Array(50).fill("subdir").join("/") + "/file.txt";
      const result = safeJoin(testBaseDir, longPath);
      expect(result).toBe(path.join(testBaseDir, longPath));
    });

    it("should allow Windows-style paths that look like drive letters but aren't", () => {
      // These look like they could be problematic but are actually safe relative paths
      // safeJoin normalizes backslashes to forward slashes
      const result1 = safeJoin(testBaseDir, "C_drive\\file.txt");
      expect(toPosixPath(result1)).toBe("/app/workspace/C_drive/file.txt");

      const result2 = safeJoin(testBaseDir, "src\\C-file.txt");
      expect(toPosixPath(result2)).toBe("/app/workspace/src/C-file.txt");
    });

    it("should handle Windows paths with multiple backslashes (not UNC)", () => {
      // Single backslashes in the middle are fine - it's only \\ at the start that's UNC
      // safeJoin normalizes backslashes to forward slashes
      const result = safeJoin(testBaseDir, "src\\\\components\\\\Button.tsx");
      expect(toPosixPath(result)).toBe(
        "/app/workspace/src/components/Button.tsx",
      );
    });

    it("provides descriptive error messages for Windows drive paths", () => {
      expect(() => safeJoin("/base", "C:\\outside.txt")).toThrow(
        'Unsafe path: joining "C:\\outside.txt" with base "/base" would escape the base directory',
      );
    });

    it("provides descriptive error for windows-drive segments in a list", () => {
      expect(() => safeJoin("/base", "C:\\a", "C:\\b")).toThrow(
        /Unsafe path: joining .* would escape the base directory/,
      );
    });
  });

  describe("boundary conditions", () => {
    it("should allow paths at the exact boundary", () => {
      const result = safeJoin(testBaseDir, ".");
      expect(result).toBe(path.join(testBaseDir, "."));
    });

    it("should handle paths that approach but don't cross boundary", () => {
      const result = safeJoin(testBaseDir, "deep/nested/../file.txt");
      expect(result).toBe(path.join(testBaseDir, "deep/nested/../file.txt"));
    });

    it("should handle root directory as base", () => {
      const result = safeJoin("/", "tmp/file.txt");
      expect(result).toBe(path.join("/", "tmp/file.txt"));
    });

    it("resolves traversal from the filesystem root", () => {
      expect(safeJoin("/tmp", "../etc/passwd")).toBe(
        path.join("/", "etc", "passwd"),
      );
    });
  });
});
