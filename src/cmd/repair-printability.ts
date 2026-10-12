/**
 * repair-printability — https://docs.meshy.ai/en/api/repair-printability
 * Fix non-watertight / non-manifold geometry. Existing textures are removed
 * (re-run retexture afterward if needed). Costs 10 credits on success.
 */

import { UsageError } from "../internal/errors.js";
import { buildResourceCommand, type ResourceCommandSpec } from "../internal/task-command.js";

const spec: ResourceCommandSpec = {
  name: "repair-printability",
  description:
    "Repair geometric defects (non-manifold edges, holes, degenerate faces) so a model can " +
    "be 3D-printed. Textures are dropped — re-run retexture afterwards if needed",
  create: {
    description: "Create a repair-printability task",
    configure(cmd) {
      return cmd
        .option("--input-task-id <id>", "source SUCCEEDED task (image-to-3d, multi-image-to-3d, text-to-3d, remesh, or retexture) — takes priority over --model-url")
        .option(
          "--model-url <src>",
          "3D model: an http(s) URL (.glb/.gltf/.obj/.fbx/.stl, max 100MB; the output keeps the input format) or a local .glb/.gltf file — the API takes inline uploads as glTF only, so host .stl/.obj/.fbx at a URL",
        );
    },
    toPayload(opts) {
      if (!opts.inputTaskId && !opts.modelUrl && !opts.data) {
        throw new UsageError("provide --input-task-id or --model-url");
      }
      return {
        input_task_id: opts.inputTaskId,
        model_url: opts.modelUrl,
      };
    },
  },
  endpointOf: (c) => c.repairPrintability,
};

export const repairPrintabilityCommand = buildResourceCommand(spec);
