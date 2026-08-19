import { dialog } from "electron";
import { referenceContracts } from "@/ipc/types/reference";
import { createTypedHandler } from "./base";
import {
  addReference,
  listReferences,
  removeReference,
} from "@/ipc/reference/reference_store";

export function registerReferenceHandlers(): void {
  createTypedHandler(
    referenceContracts.addReference,
    async (_event, { appPath, chatId }) => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile", "openDirectory", "multiSelections"],
        title: "Select reference files or folders",
      });
      if (result.canceled || result.filePaths.length === 0) return [];
      return addReference(chatId, result.filePaths, appPath);
    },
  );

  createTypedHandler(
    referenceContracts.listReferences,
    async (_event, { appPath, chatId }) => {
      return listReferences(chatId, appPath);
    },
  );

  createTypedHandler(
    referenceContracts.removeReference,
    async (_event, { appPath, chatId, referencePath }) => {
      removeReference(chatId, referencePath, appPath);
    },
  );
}
