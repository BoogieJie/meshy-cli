/**
 * Endpoints and parameters from the current public API docs, asserted on the
 * wire against a loopback API.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { jsonReply, parseSingleJson, runCli, startMockApi, type MockApi } from "./helpers/cli.js";

async function withApi(handler: Parameters<typeof startMockApi>[0], fn: (api: MockApi) => Promise<void>): Promise<void> {
  const api = await startMockApi(handler);
  try {
    await fn(api);
  } finally {
    await api.close();
  }
}

const accept: Parameters<typeof startMockApi>[0] = (req, res) =>
  req.method === "POST" ? jsonReply(res, 200, { result: "task-new" }) : jsonReply(res, 500, { message: "unexpected" });

const body = (api: MockApi, i = 0) => api.requests.filter((q) => q.method === "POST")[i]!.json as Record<string, unknown>;

// ---------------------------------------------------------------------------
// auto-split
// ---------------------------------------------------------------------------

test("auto-split create: flags reach POST /openapi/v1/print/split; v1 envelope by default", async () => {
  await withApi(accept, async (api) => {
    const r = await runCli([
      "auto-split", "create", "--input-task-id", "src-1", "--mode", "by_parts", "--prompt", "head, torso, legs",
      "--target-formats", "glb,3mf", "--layout", "on_plate", "--connectors", "true", "--connector-type", "cylinder",
      "--connector-size", "0.4", "--connector-height", "0.2", "--async",
    ], { env: api.env() });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(api.requests[0]!.path, "/openapi/v1/print/split");
    assert.deepEqual(body(api), {
      input_task_id: "src-1", mode: "by_parts", prompt: "head, torso, legs", target_formats: ["glb", "3mf"], layout: "on_plate",
      connectors: true, connector_type: "cylinder", connector_size: 0.4, connector_height: 0.2,
    });
    const out = parseSingleJson(r.stdout) as { command: string; result: { task_id: string } };
    assert.equal(out.command, "auto-split.create");
    assert.equal(out.result.task_id, "task-new");
  });
});

test("auto-split create: missing prompt for by_parts/by_color, out-of-range connectors and connector tuning without connectors are refused locally", async () => {
  await withApi(accept, async (api) => {
    for (const args of [
      ["--mode", "by_color"],
      ["--connectors", "true", "--connector-size", "0.9"],
      ["--connector-type", "cube"],
      ["--prompt", "x".repeat(601), "--mode", "by_parts"],
      [],
    ]) {
      const withTask = args.length === 0 ? [] : ["--input-task-id", "src-1"];
      const r = await runCli(["auto-split", "create", ...withTask, ...args, "--async"], { env: api.env() });
      assert.equal(r.code, 2, `${args.join(" ")}: ${r.stdout}`);
    }
    assert.equal(api.requests.length, 0);
  });
});

test("auto-split get/list/delete use /print/split", async () => {
  await withApi((req, res) => {
    if (req.method === "DELETE") return jsonReply(res, 200, {});
    if (req.path === "/openapi/v1/print/split") return jsonReply(res, 200, []);
    return jsonReply(res, 200, { id: "s-1", type: "print-split", status: "SUCCEEDED", progress: 100, part_count: 3, model_urls: { glb: "https://assets.example.invalid/s.glb" } });
  }, async (api) => {
    const get = await runCli(["auto-split", "get", "s-1"], { env: api.env() });
    assert.equal(get.code, 0, get.stderr);
    assert.equal((parseSingleJson(get.stdout) as { result: { task: { status: string } } }).result.task.status, "SUCCEEDED");
    assert.equal((await runCli(["auto-split", "list"], { env: api.env() })).code, 0);
    assert.equal((await runCli(["auto-split", "delete", "s-1"], { env: api.env() })).code, 0);
    assert.deepEqual(api.requests.map((q) => `${q.method} ${q.path}`), [
      "GET /openapi/v1/print/split/s-1",
      "GET /openapi/v1/print/split",
      "DELETE /openapi/v1/print/split/s-1",
    ]);
  });
});

// ---------------------------------------------------------------------------
// usage
// ---------------------------------------------------------------------------

test("usage tasks: one GET with pagination, window, endpoint and status filters; records passed through", async () => {
  const records = [{ task_id: "t-1", endpoint: "image-to-3d", status: "SUCCEEDED", created_at: 1, finished_at: 2, consumed_credits: 20, api_key_name: "ci", api_key_suffix: "a1b2" }];
  await withApi((req, res) => (req.path === "/openapi/v1/usage/tasks" ? jsonReply(res, 200, records) : jsonReply(res, 404, {})), async (api) => {
    const r = await runCli([
      "usage", "tasks", "--page", "2", "--page-size", "50", "--sort-by", "+created_at", "--start-time", "2026-08-01T00:00:00Z",
      "--end-time", "2026-09-01T00:00:00Z", "--endpoints", "image-to-3d,text-to-3d", "--status", "SUCCEEDED",
    ], { env: api.env() });
    assert.equal(r.code, 0, r.stderr);
    const q = Object.fromEntries(new URL(api.requests[0]!.url, "http://x").searchParams);
    assert.deepEqual(q, {
      page_num: "2", page_size: "50", sort_by: "+created_at", start_time: "2026-08-01T00:00:00Z", end_time: "2026-09-01T00:00:00Z",
      endpoints: "image-to-3d,text-to-3d", status: "SUCCEEDED",
    });
    const out = parseSingleJson(r.stdout) as { command: string; result: { items: unknown[]; count: number; page: { page_num: number } } };
    assert.equal(out.command, "usage.tasks");
    assert.deepEqual(out.result.items, records);
    assert.equal(out.result.page.page_num, 2);
  });
});

test("usage tasks: a bad window or page size is refused locally; a 403 (plan) is an auth-class error", async () => {
  await withApi((_req, res) => jsonReply(res, 403, { message: "Studio or Enterprise plan required" }), async (api) => {
    assert.equal((await runCli(["usage", "tasks", "--start-time", "yesterday"], { env: api.env() })).code, 2);
    assert.equal((await runCli(["usage", "tasks", "--page-size", "101"], { env: api.env() })).code, 2);
    assert.equal(api.requests.length, 0);
    const r = await runCli(["usage", "tasks"], { env: api.env() });
    assert.notEqual(r.code, 0);
    assert.equal((parseSingleJson(r.stdout) as { error: { http_status: number } }).error.http_status, 403);
  });
});

// ---------------------------------------------------------------------------
// animate / rigging
// ---------------------------------------------------------------------------

test("animate: --action-ids (one merged file) and --motion-task-id; exactly one source, ids unique and at most 10", async () => {
  await withApi(accept, async (api) => {
    const many = await runCli(["animate", "create", "--rig-task-id", "rig-1", "--action-ids", "10,25,92", "--async"], { env: api.env() });
    assert.equal(many.code, 0, many.stderr);
    assert.deepEqual(body(api, 0), { rig_task_id: "rig-1", action_ids: [10, 25, 92] });
    const motion = await runCli(["animate", "create", "--rig-task-id", "rig-1", "--motion-task-id", "mo-1", "--async"], { env: api.env() });
    assert.equal(motion.code, 0, motion.stderr);
    assert.deepEqual(body(api, 1), { rig_task_id: "rig-1", motion_task_id: "mo-1" });
    for (const extra of [
      ["--action-id", "1", "--action-ids", "2,3"],
      ["--action-ids", "1,1"],
      ["--action-ids", "1,2,3,4,5,6,7,8,9,10,11"],
      ["--action-ids", "wave"],
      [],
    ]) {
      const r = await runCli(["animate", "create", "--rig-task-id", "rig-1", ...extra, "--async"], { env: api.env() });
      assert.equal(r.code, 2, `${extra.join(" ")}: ${r.stdout}`);
    }
    assert.equal(api.requests.length, 2);
  });
});

test("rigging list is enabled (GET /openapi/v1/rigging)", async () => {
  await withApi((_req, res) => jsonReply(res, 200, []), async (api) => {
    const r = await runCli(["rigging", "list", "--output-schema", "v1"], { env: api.env() });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(api.requests[0]!.path, "/openapi/v1/rigging");
  });
});
