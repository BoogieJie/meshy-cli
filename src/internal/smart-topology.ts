/**
 * Smart Topology models, shared by image-to-3d and text-to-3d preview so the
 * two commands cannot drift apart.
 *
 * Without --ai-model the request carries no ai_model and the API picks
 * meshy-t2. meshy-t2.5 takes a polycount up to 30,000 (meshy-t2: 15,000).
 * Both need model_type "smart-topology", and both output triangles only.
 */

import { UsageError } from "./errors.js";

export const SMART_TOPOLOGY_MODELS = ["meshy-t2", "meshy-t2.5"] as const;

const MAX_POLYCOUNT: Readonly<Record<string, number>> = { "meshy-t2": 15_000, "meshy-t2.5": 30_000 };

/**
 * The CLI's polycount default (D-078): 10,000 for meshy-t2 (D-076); meshy-t2.5
 * is left to the API's own 15,000. Follows --ai-model only.
 */
export function defaultPolycount(opts: Record<string, unknown>): number | undefined {
  return opts.modelType === "smart-topology" && opts.aiModel !== "meshy-t2.5" ? 10_000 : undefined;
}

/** Checks the merged payload, so values sent through --data meet the same rules. */
export function checkSmartTopology(payload: Record<string, unknown>): void {
  const model = typeof payload.ai_model === "string" ? payload.ai_model : undefined;
  const smart = payload.model_type === "smart-topology";
  if (model && model in MAX_POLYCOUNT && !smart) {
    throw new UsageError(`${model} is a Smart Topology model: pass --model-type smart-topology`);
  }
  if (!smart) return;
  if (payload.topology === "quad") {
    throw new UsageError("smart-topology output is triangle-only; for quads chain `remesh --topology quad` afterwards");
  }
  const n = payload.target_polycount;
  const max = MAX_POLYCOUNT[model ?? "meshy-t2"]; // another model sent through --data is left to the API
  if (max !== undefined && typeof n === "number" && (n < 100 || n > max)) {
    throw new UsageError(
      model === "meshy-t2.5"
        ? "--target-polycount must be between 100 and 30000 on meshy-t2.5"
        : "--target-polycount must be between 100 and 15000 on meshy-t2 (--ai-model meshy-t2.5 takes up to 30000)",
    );
  }
}
