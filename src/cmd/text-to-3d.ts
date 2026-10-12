/**
 * text-to-3d — https://docs.meshy.ai/en/api/text-to-3d
 *
 * Two-stage flow: `--mode preview` generates geometry, then
 * `--mode refine --preview-task-id <id>` textures it.
 *
 * The flag surface is deliberately minimal: topology and polycount are
 * remesh's job, resizing is resize's job, deprecated parameters
 * (symmetry_mode, lowpoly) are gone, and there is no model choice — the
 * server default "latest" applies. Unlike the image-driven endpoints, this
 * one has no meshy-7: its model set is meshy-5 / meshy-6 / latest, and
 * "latest" is still Meshy 6. The `--data` escape hatch still reaches
 * anything the API accepts.
 */

import { Option } from "commander";
import { parseBool, parseCsv } from "../internal/flags.js";
import { UsageError } from "../internal/errors.js";
import { buildResourceCommand, type ResourceCommandSpec } from "../internal/task-command.js";

const spec: ResourceCommandSpec = {
  name: "text-to-3d",
  description:
    "Generate 3D models from text prompts (two-stage: preview → refine). " +
    "Topology/polycount are not tunable here — chain `remesh` afterwards",
  create: {
    description: "Create a text-to-3d task",
    configure(cmd) {
      return cmd
        .addOption(new Option("--mode <mode>", "preview | refine").choices(["preview", "refine"]))
        .option("--prompt <text>", "required in preview mode; max 600 chars")
        .option(
          "--preview-task-id <id>",
          "required in refine mode. Must be a SUCCEEDED text-to-3d preview task — refine " +
            "consumes the preview's latents, so uploaded models or image-to-3d/remesh outputs " +
            "cannot be refined (use retexture for those)",
        )
        .addOption(
          new Option(
            "--pose-mode <pose>",
            "preview only. a-pose | t-pose pre-pose characters for rigging; auto (default) lets the model decide",
          ).choices(["a-pose", "t-pose", "auto"]),
        )
        .option(
          "--enable-pbr <bool>",
          "refine only. Generate normal/metallic/roughness/emission maps (default: true, so game-engine imports carry the full map set)",
          parseBool,
        )
        .option("--texture-prompt <text>", "refine only. Extra texture guidance (max 600 chars)")
        .addOption(
          new Option(
            "--texture-resolution <res>",
            "refine only. Base color texture size (default: the server's, 2k). 4k/8k need a meshy-6, meshy-7.1 or latest preview — a meshy-6-lite preview refuses them",
          ).choices(["2k", "4k", "8k"]),
        )
        .option(
          "--remove-lighting <bool>",
          "refine only. Strip baked lighting from the base color (default: the server's — on for meshy-6/7; a meshy-6-lite preview refuses the flag)",
          parseBool,
        )
        .option("--target-formats <csv>", "glb,obj,fbx,stl,usdz,3mf (default: glb)", parseCsv);
    },
    toPayload(opts) {
      const mode = opts.mode as string | undefined;
      if (mode === "preview" && !opts.prompt) {
        throw new UsageError("--mode preview requires --prompt");
      }
      if (mode === "refine" && !opts.previewTaskId) {
        throw new UsageError("--mode refine requires --preview-task-id");
      }
      return {
        mode,
        prompt: opts.prompt,
        preview_task_id: opts.previewTaskId,
        // "auto" means "let the model decide" — the API's default, expressed by omission.
        pose_mode: opts.poseMode === "auto" ? undefined : opts.poseMode,
        enable_pbr: opts.enablePbr,
        texture_prompt: opts.texturePrompt,
        texture_resolution: opts.textureResolution,
        remove_lighting: opts.removeLighting,
        target_formats: opts.targetFormats,
      };
    },
    toDefaults(opts) {
      // Refine inherits its model from the preview, and the task GET does not
      // say which model that was. So only what every refine target accepts is
      // pinned here: the full PBR map set. texture_resolution 4k and
      // remove_lighting are refused (400) for a meshy-6-lite preview, so they
      // ride only when asked for — the server's own defaults (2k; lighting
      // removed on meshy-6/7) apply otherwise. `make` still asks for 4k: it
      // made the preview itself, on latest.
      // GLB-only output — omitting target_formats makes the API produce
      // every format.
      const refine = opts.mode === "refine";
      return {
        enable_pbr: refine ? true : undefined,
        target_formats: ["glb"],
      };
    },
  },
  endpointOf: (c) => c.textTo3d,
};

export const textTo3dCommand = buildResourceCommand(spec);
