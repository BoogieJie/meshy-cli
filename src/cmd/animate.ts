/**
 * animate — https://docs.meshy.ai/en/api/animation
 *
 * POST /animations takes `rig_task_id` plus exactly one source: a library
 * `action_id`, up to 10 `action_ids` merged into one file (one clip per
 * action, in the order given; billed per action), or a text-to-motion
 * `motion_task_id`. Optional nested `post_process` for change_fps / fbx2usdz /
 * extract_armature.
 */

import { Option } from "commander";
import { parseCsv, parseInt10 } from "../internal/flags.js";
import { UsageError } from "../internal/errors.js";
import { buildResourceCommand, type ResourceCommandSpec } from "../internal/task-command.js";

const MAX_ACTIONS = 10;

const spec: ResourceCommandSpec = {
  name: "animate",
  description:
    "Apply animation to a rigged character: one library action, up to 10 actions merged into one " +
    "file, or a text-to-motion clip. Find action ids with `meshy animation-catalog list`",
  create: {
    description: "Create an animation task",
    configure(cmd) {
      return cmd
        .option("--rig-task-id <id>", "SUCCEEDED rigging task id (required)")
        .option("--action-id <n>", "one library action id (integer)", parseInt10)
        .option(
          "--action-ids <csv>",
          `1-${MAX_ACTIONS} unique library action ids; returns one file with one clip per action, in this order (billed per action)`,
          parseCsv,
        )
        .option("--motion-task-id <id>", "SUCCEEDED text-to-motion task whose clip to retarget (biped rigs only)")
        .addOption(
          new Option("--post-process-operation <op>", "optional post-processing step")
            .choices(["change_fps", "fbx2usdz", "extract_armature"]),
        )
        .addOption(
          new Option("--post-process-fps <fps>", "target FPS for change_fps (default: 30)")
            .choices(["24", "25", "30", "60"]),
        );
    },
    toPayload(opts) {
      if (!opts.rigTaskId && !opts.data) {
        throw new UsageError("--rig-task-id is required");
      }
      const ids = opts.actionIds as string[] | undefined;
      let actionIds: number[] | undefined;
      if (ids) {
        actionIds = ids.map((id) => {
          if (!/^-?\d+$/.test(id)) throw new UsageError(`--action-ids: '${id}' is not an integer action id`);
          return Number(id);
        });
      }
      const payload: Record<string, unknown> = {
        rig_task_id: opts.rigTaskId,
        action_id: opts.actionId,
        action_ids: actionIds,
        motion_task_id: opts.motionTaskId,
      };
      if (opts.postProcessOperation) {
        const post: Record<string, unknown> = { operation_type: opts.postProcessOperation };
        if (opts.postProcessOperation === "change_fps" && opts.postProcessFps != null) {
          post.fps = Number(opts.postProcessFps);
        }
        payload.post_process = post;
      }
      return payload;
    },
    validatePayload(payload) {
      const sources = (["action_id", "action_ids", "motion_task_id"] as const).filter((k) => payload[k] !== undefined && payload[k] !== null);
      if (sources.length !== 1) {
        throw new UsageError(
          sources.length === 0
            ? "provide one of --action-id, --action-ids or --motion-task-id"
            : `--action-id, --action-ids and --motion-task-id are mutually exclusive (got ${sources.join(", ")})`,
        );
      }
      const ids = payload.action_ids;
      if (ids !== undefined) {
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_ACTIONS) {
          throw new UsageError(`action_ids takes 1-${MAX_ACTIONS} action ids`);
        }
        if (new Set(ids).size !== ids.length) throw new UsageError("action_ids must be unique");
      }
    },
  },
  endpointOf: (c) => c.animate,
};

export const animateCommand = buildResourceCommand(spec);
