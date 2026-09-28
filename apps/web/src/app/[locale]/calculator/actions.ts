"use server";

import { deleteCalculation, estimate, saveCalculation, type CalculatorInput, type CalculatorResult, type SavedCalculation } from "@/lib/gold";

export type EstimateState = { result?: CalculatorResult; error?: "locked" | "invalid" | "error" };

/** Runs the calculator in the Go API (the logic lives there, SCOPE §8). */
export async function estimateAction(input: CalculatorInput): Promise<EstimateState> {
  const res = await estimate(input);
  if (res.result) return { result: res.result };
  if (res.code === "FEATURE_LOCKED") return { error: "locked" };
  return { error: res.status === 400 ? "invalid" : "error" };
}

export async function saveAction(name: string, input: CalculatorInput): Promise<{ saved?: SavedCalculation; error?: "locked" | "invalid" | "full" | "error" }> {
  const res = await saveCalculation(name.slice(0, 80), input);
  if (res.saved) return { saved: res.saved };
  if (res.code === "FEATURE_LOCKED") return { error: "locked" };
  if (res.status === 409) return { error: "full" };
  return { error: res.status === 400 ? "invalid" : "error" };
}

export async function deleteAction(id: string): Promise<boolean> {
  return (await deleteCalculation(id)).status === 204;
}
