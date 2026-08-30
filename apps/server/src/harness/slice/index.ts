import type { SpecDoc, SpecSlice } from "../planner/specValidator.ts";

export type SliceStatus = "pending" | "building" | "verifying" | "fixing" | "completed" | "failed";

export interface SliceDefinition {
  id: string;
  name: string;
  description: string;
  files: string[];
  acceptanceCriteria: string[];
  status: SliceStatus;
  attemptCount: number;
}

export class SliceManager {
  private slices: SliceDefinition[] = [];

  constructor(initialSlices: SpecSlice[] = []) {
    this.initializeFromSpecSlices(initialSlices);
  }

  static fromSpec(spec: SpecDoc): SliceManager {
    return new SliceManager(spec.slices);
  }

  initializeFromSpecSlices(specSlices: SpecSlice[]): void {
    this.slices = specSlices.map((s, index) => ({
      id: `slice-${index + 1}`,
      name: s.name,
      description: s.description,
      files: [...s.files],
      acceptanceCriteria: [...s.acceptanceCriteria],
      status: "pending",
      attemptCount: 0,
    }));
  }

  getNextSlice(): SliceDefinition | null {
    return this.slices.find((s) => s.status === "pending" || s.status === "fixing") ?? null;
  }

  getSlice(id: string): SliceDefinition | null {
    return this.slices.find((s) => s.id === id) ?? null;
  }

  getAllSlices(): readonly SliceDefinition[] {
    return this.slices;
  }

  updateSliceStatus(id: string, status: SliceStatus): void {
    const slice = this.getSlice(id);
    if (slice) {
      slice.status = status;
      if (status === "building" || status === "fixing") {
        slice.attemptCount += 1;
      }
    }
  }

  markCompleted(id: string): void {
    this.updateSliceStatus(id, "completed");
  }

  markFailed(id: string): void {
    this.updateSliceStatus(id, "failed");
  }

  isAllCompleted(): boolean {
    return this.slices.length > 0 && this.slices.every((s) => s.status === "completed");
  }

  getProgress(): { completed: number; total: number; percent: number } {
    const completed = this.slices.filter((s) => s.status === "completed").length;
    const total = this.slices.length;
    return {
      completed,
      total,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  }
}
