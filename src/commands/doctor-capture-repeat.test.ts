import fs from "node:fs/promises";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { writeOpenClawConfig } from "../config/test-helpers.js";
import * as packageRoot from "../infra/openclaw-root.js";
import { resolveUpdateCaptureRoot } from "../infra/update-capture-paths.js";
import { closeOpenClawStateDatabaseAsync } from "../state/openclaw-state-db.js";
import { withEnvAsync } from "../test-utils/env.js";
import { withDoctorConfigPreflightHome } from "./doctor-config-preflight.test-support.js";
import { doctorCommand } from "./doctor.js";

it("reuses one original across three healthy Doctor repairs and captures a real change", () =>
  withDoctorConfigPreflightHome(async (root) => {
    await withEnvAsync(
      {
        XDG_CACHE_HOME: path.join(root, "cache"),
        OPENCLAW_PROFILE: undefined,
        OPENCLAW_AGENT_DIR: undefined,
        PI_CODING_AGENT_DIR: undefined,
        OPENCLAW_UPDATE_IN_PROGRESS: undefined,
        OPENCLAW_UPDATE_RUN_ID: undefined,
        OPENCLAW_IMAGE_ACTIVATION_CAPTURE_MARKER: undefined,
        OPENCLAW_DISABLE_BUNDLED_PLUGINS: "1",
        OPENCLAW_SERVICE_REPAIR_POLICY: "external",
      },
      async () => {
        // The shared Doctor fixture owns HOME, state, managed-update temp paths and worker cleanup.
        using installRoot = vi.spyOn(packageRoot, "resolveOpenClawPackageRoot");
        installRoot.mockResolvedValue(root);
        await fs.writeFile(
          path.join(root, "package.json"),
          JSON.stringify({ name: "openclaw", version: "2026.10.22" }),
        );
        await fs.mkdir(path.join(root, "workspace"));
        const config = await writeOpenClawConfig(root, {
          gateway: {
            mode: "local",
            port: 1,
            auth: { mode: "token", token: "synthetic-doctor-token" },
          },
          agents: { defaults: { workspace: path.join(root, "workspace") } },
          memory: { search: { enabled: false, rememberAcrossConversations: false } },
          plugins: { enabled: false },
        });
        const runtime = { log: vi.fn(), error: vi.fn(), exit: vi.fn() };
        const repair = async () => {
          await doctorCommand(runtime, { repair: true, nonInteractive: true, json: true });
          await closeOpenClawStateDatabaseAsync();
          expect(
            runtime.exit.mock.calls.every(([code]) => code === 0),
            runtime.log.mock.calls.flat().join("\n"),
          ).toBe(true);
        };
        // Finish first-install migrations before measuring unchanged healthy repairs.
        await repair();
        await repair();
        const state = path.dirname(config);
        const captureRoot = resolveUpdateCaptureRoot(state);
        await fs.rm(captureRoot, { recursive: true, force: true });
        const captures = async () =>
          (await fs.readdir(captureRoot)).filter((name) => name.startsWith("doctor-"));
        const databasePath = path.join(state, "state", "openclaw.sqlite");
        const healthyDatabase = await fs.readFile(databasePath);
        for (let run = 1; run <= 3; run++) {
          await repair();
          expect.soft(await captures(), `healthy repair ${run}`).toHaveLength(1);
          expect
            .soft(await fs.readFile(databasePath), `healthy repair ${run} leaves SQLite unchanged`)
            .toEqual(healthyDatabase);
        }
        const before = await captures();
        const cfg = JSON.parse(await fs.readFile(config, "utf8"));
        cfg.gateway.port = 2;
        await fs.writeFile(config, JSON.stringify(cfg));
        await repair();
        expect(await captures()).toHaveLength(2);
        expect(await captures()).toEqual(expect.arrayContaining(before));
      },
    );
  }));
