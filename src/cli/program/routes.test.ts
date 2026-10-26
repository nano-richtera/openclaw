import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultRuntime } from "../../runtime.js";
import {
  applyCliExecutionStartupPresentation,
  ensureCliExecutionBootstrap,
} from "../command-execution-startup.js";
import { tryRouteCli } from "../route.js";
import { expectNoCalls } from "./program.test-helpers.js";

const modelsStatusCommandMock = vi.hoisted(() => vi.fn(async () => {}));
const runDaemonStatusMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../command-execution-startup.js", () => ({
  applyCliExecutionStartupPresentation: vi.fn(async () => {}),
  ensureCliExecutionBootstrap: vi.fn(async () => {}),
}));

vi.mock("../../commands/models/list.status-command.js", () => ({
  modelsStatusCommand: modelsStatusCommandMock,
}));

// mock-isolation: Route dispatch stops at the daemon entrypoint without opening service state.
vi.mock("../daemon-cli/status.js", () => ({
  runDaemonStatus: runDaemonStatusMock,
}));

describe("program routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENCLAW_LOG_LEVEL", undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  async function expectRouted(args: string) {
    await expect(tryRouteCli(["node", "openclaw", ...args.split(" ")])).resolves.toBe(true);
  }

  it.each([
    ["plugins", "list", "--wat"],
    ["gateway", "status", "--ssh-identity", "~/.ssh/id_test"],
    ["sessions", "--store", ""],
    ["models", "--", "--status-json"],
  ])("defers unsupported arguments %j to Commander", async (...args) => {
    await expect(tryRouteCli(["node", "openclaw", ...args])).resolves.toBe(false);
    expectNoCalls(
      vi.mocked(applyCliExecutionStartupPresentation),
      vi.mocked(ensureCliExecutionBootstrap),
      modelsStatusCommandMock,
    );
  });

  it("routes local runtime intent with config and plugin startup disabled", async () => {
    await expectRouted("gateway status --runtime-intent-only --json");
    expect(runDaemonStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeIntentOnly: true, json: true }),
    );
    expect(ensureCliExecutionBootstrap).toHaveBeenCalledWith(
      expect.objectContaining({
        startupPolicy: expect.objectContaining({ skipConfigGuard: true, loadPlugins: false }),
      }),
    );
  });

  it("accepts negative-number probe profile values", async () => {
    await expectRouted(
      "models status --probe-provider openai --probe-timeout 5000 --probe-concurrency 2 " +
        "--probe-max-tokens 64 --probe-profile -1 --agent default",
    );
    expect(modelsStatusCommandMock).toHaveBeenCalledWith(
      {
        probeProvider: "openai",
        probeTimeout: "5000",
        probeConcurrency: "2",
        probeMaxTokens: "64",
        probeProfile: "-1",
        agent: "default",
        json: false,
        plain: false,
        check: false,
        probe: false,
      },
      defaultRuntime,
    );
  });
});
