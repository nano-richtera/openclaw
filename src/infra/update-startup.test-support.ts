import { vi } from "vitest";
import type * as Handoff from "./update-managed-service-handoff.js";

const mocks = vi.hoisted(() => ({
  cancelManagedServiceUpdateHandoffMock: vi.fn<typeof Handoff.cancelManagedServiceUpdateHandoff>(
    async () => "restored-in-process",
  ),
  checkTelemetryUpdateMock: vi.fn<typeof import("./telemetry.js").checkTelemetryUpdate>(),
  detectRespawnSupervisorMock: vi.fn(),
  getRuntimeConfigMock: vi.fn(() => ({})),
  runUpdateFailureTriageMock: vi.fn<typeof import("./update-triage.js").runUpdateFailureTriage>(),
  refreshRemoteModelCatalogMock: vi.fn<
    typeof import("../model-catalog/remote-refresh.js").refreshRemoteModelCatalog
  >(async () => ({
    status: "unchanged" as const,
    providers: 1,
    models: 1,
    generatedAt: 1_753_500_000_000,
  })),
  scheduleGatewayRestartMock: vi.fn(() => ({ scheduled: true })),
  startManagedServiceUpdateHandoffMock: vi.fn<typeof Handoff.startManagedServiceUpdateHandoff>(),
  transferManagedServiceUpdateHandoffMock: vi.fn<
    typeof Handoff.transferManagedServiceUpdateHandoff
  >(async () => true),
  versionMock: { value: "1.0.0" },
}));

// mock-isolation: Use fixture configuration without reading operator state.
vi.mock("../config/config.js", () => ({ getRuntimeConfig: mocks.getRuntimeConfigMock }));

vi.mock("./update-triage.js", () => ({ runUpdateFailureTriage: mocks.runUpdateFailureTriageMock }));

vi.mock("../model-catalog/remote-refresh.js", async (original) => ({
  ...(await original<typeof import("../model-catalog/remote-refresh.js")>()),
  refreshRemoteModelCatalog: mocks.refreshRemoteModelCatalogMock,
}));

vi.mock("./openclaw-root.js", async (original) => ({
  ...(await original<typeof import("./openclaw-root.js")>()),
  resolveOpenClawPackageRoot: vi.fn(),
}));

vi.mock("./restart.js", async () => ({
  ...(await vi.importActual<typeof import("./restart.js")>("./restart.js")),
  scheduleGatewayRestart: mocks.scheduleGatewayRestartMock,
}));

vi.mock("./supervisor-markers.js", async (original) => ({
  ...(await original<typeof import("./supervisor-markers.js")>()),
  detectRespawnSupervisor: mocks.detectRespawnSupervisorMock,
}));

// mock-isolation: Observe startup telemetry without making network requests.
vi.mock("./telemetry.js", () => ({ checkTelemetryUpdate: mocks.checkTelemetryUpdateMock }));

vi.mock("./update-check.js", async (original) => ({
  ...(await original<typeof import("./update-check.js")>()),
  checkUpdateStatus: vi.fn(),
  resolveNpmChannelTag: vi.fn(),
}));

vi.mock("../version.js", () => ({
  get VERSION() {
    return mocks.versionMock.value;
  },
}));

// mock-isolation: Startup fixtures must not execute updater commands.
vi.mock("../process/exec.js", () => ({ runCommandWithTimeout: vi.fn() }));

vi.mock("./update-managed-service-handoff.js", async () => ({
  ...(await vi.importActual<typeof import("./update-managed-service-handoff.js")>(
    "./update-managed-service-handoff.js",
  )),
  cancelManagedServiceUpdateHandoff: mocks.cancelManagedServiceUpdateHandoffMock,
  startManagedServiceUpdateHandoff: mocks.startManagedServiceUpdateHandoffMock,
  transferManagedServiceUpdateHandoff: mocks.transferManagedServiceUpdateHandoffMock,
}));

export const {
  cancelManagedServiceUpdateHandoffMock,
  checkTelemetryUpdateMock,
  detectRespawnSupervisorMock,
  getRuntimeConfigMock,
  runUpdateFailureTriageMock,
  refreshRemoteModelCatalogMock,
  scheduleGatewayRestartMock,
  startManagedServiceUpdateHandoffMock,
  transferManagedServiceUpdateHandoffMock,
  versionMock,
} = mocks;
