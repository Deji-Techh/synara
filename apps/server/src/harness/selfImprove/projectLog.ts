import * as fs from "node:fs";
import * as path from "node:path";

export interface ProjectRunLog {
  projectId: string;
  framework: string;
  skills: string[];
  verifierPassRate: number;
  fixerRetryCount: number;
  tasteScore: number;
  benchmarkScore: number;
  edgeCasesFound: string[];
  timestamp: number;
}

export interface RecurringPatternAnalysis {
  recurringFailures: Array<{ failure: string; occurrences: number; recommendation: string }>;
  bestSkillCombos: Array<{ skills: string[]; averagePassRate: number; averageTasteScore: number }>;
}

export class ProjectLogStore {
  private logPath: string;

  constructor(storageDir?: string) {
    const dir = storageDir || path.join(process.cwd(), ".caide", "telemetry");
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        // ignore
      }
    }
    this.logPath = path.join(dir, "project-runs.jsonl");
  }

  async appendLog(log: ProjectRunLog): Promise<void> {
    const line = JSON.stringify(log) + "\n";
    await fs.promises.appendFile(this.logPath, line, "utf-8");
  }

  async readLogs(): Promise<ProjectRunLog[]> {
    if (!fs.existsSync(this.logPath)) {
      return [];
    }
    const content = await fs.promises.readFile(this.logPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const logs: ProjectRunLog[] = [];

    for (const line of lines) {
      try {
        logs.push(JSON.parse(line));
      } catch {
        // ignore malformed lines
      }
    }

    return logs;
  }

  static analyzePatterns(logs: ProjectRunLog[]): RecurringPatternAnalysis {
    const failureCount = new Map<string, number>();

    for (const log of logs) {
      for (const edge of log.edgeCasesFound) {
        failureCount.set(edge, (failureCount.get(edge) || 0) + 1);
      }
    }

    const recurringFailures: RecurringPatternAnalysis["recurringFailures"] = [];
    for (const [failure, occurrences] of failureCount.entries()) {
      if (occurrences >= 3) {
        recurringFailures.push({
          failure,
          occurrences,
          recommendation: `Promote strict ${failure} handling rule directly into Builder L1 prompt and skill packs.`,
        });
      }
    }

    // Analyze skill combinations
    const comboMap = new Map<string, { count: number; totalPassRate: number; totalTasteScore: number; skills: string[] }>();
    for (const log of logs) {
      const key = [...log.skills].sort().join("+");
      const existing = comboMap.get(key) || {
        count: 0,
        totalPassRate: 0,
        totalTasteScore: 0,
        skills: log.skills,
      };
      existing.count += 1;
      existing.totalPassRate += log.verifierPassRate;
      existing.totalTasteScore += log.tasteScore;
      comboMap.set(key, existing);
    }

    const bestSkillCombos = Array.from(comboMap.values())
      .map((c) => ({
        skills: c.skills,
        averagePassRate: Math.round((c.totalPassRate / c.count) * 100) / 100,
        averageTasteScore: Math.round((c.totalTasteScore / c.count) * 100) / 100,
      }))
      .sort((a, b) => b.averagePassRate + b.averageTasteScore - (a.averagePassRate + a.averageTasteScore));

    return {
      recurringFailures,
      bestSkillCombos,
    };
  }
}
