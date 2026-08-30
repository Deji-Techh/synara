/**
 * Edge sweep — systematic per-slice (M14) + Adversarial self-play (M15).
 */
export type EdgeCase = "long_text" | "missing_data" | "slow_network" | "double_tap" | "out_of_order" | "malformed_input";

export function edgeCasesForSlice(): EdgeCase[] {
  return ["long_text", "missing_data", "slow_network", "double_tap"];
}

export function adversarialCases(): EdgeCase[] {
  return ["out_of_order", "malformed_input"];
}
