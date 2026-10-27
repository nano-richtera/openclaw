import "./dynamic-tool-build.test-support.js";
import path from "node:path";
import { createOpenClawCodingTools } from "openclaw/plugin-sdk/agent-harness";
import type { EmbeddedRunAttemptParamsV2 as EmbeddedRunAttemptParams } from "openclaw/plugin-sdk/agent-harness-runtime";
import {
  createOutboundTestPlugin,
  createTestRegistry,
  getActivePluginRegistry,
  resetPluginRuntimeStateForTest,
  setActivePluginRegistry,
} from "openclaw/plugin-sdk/plugin-test-runtime";
import {
  closeOpenClawAgentDatabasesAsync,
  closeOpenClawStateDatabaseAsync,
} from "openclaw/plugin-sdk/sqlite-runtime-testing";
import { useAutoCleanupTempDirTracker } from "openclaw/plugin-sdk/test-env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeDynamicToolForTest } from "./dynamic-tool-build.test-support.js";
import { createCodexDynamicToolBridge } from "./dynamic-tools.js";
import { setCodexTestToolFactory } from "./host-capability.test-support.js";
import { CODEX_OPENCLAW_DIRECT_DYNAMIC_TOOL_NAMESPACE } from "./protocol.js";
const {
  buildDynamicToolsForTest,
  createCodexRuntimePlanFixture,
  createParams: createBaseParams,
  hoisted,
} = await import("./dynamic-tool-build.test-support.js");
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
let tempDir: string;
type ToolOptions = NonNullable<Parameters<typeof createOpenClawCodingTools>[0]>;
function createParams(sessionFile: string, workspaceDir: string): EmbeddedRunAttemptParams {
  return {
    ...createBaseParams(sessionFile, workspaceDir),
    disableTools: false,
    runtimePlan: createCodexRuntimePlanFixture(),
  };
}
beforeEach(() => {
  hoisted.loadNodeExecAvailability.mockResolvedValue({
    cacheKey: "eligible",
    isAvailable: () => true,
  });
  hoisted.normalizeAgentRuntimeTools.mockClear();
  hoisted.resolveWebSearchToolPolicy.mockClear();
  tempDir = tempDirs.make("openclaw-codex-catalog-");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await closeOpenClawAgentDatabasesAsync();
  await closeOpenClawStateDatabaseAsync();
  vi.unstubAllEnvs();
});
describe("Codex stable catalog and live authority", () => {
  it("keeps message registration stable without enabling completion-turn delivery", async () => {
    const workspaceDir = path.join(tempDir, "message-continuity");
    const params = createParams(path.join(tempDir, "message-continuity.jsonl"), workspaceDir);
    params.config = { tools: { profile: "coding" }, channels: { whatsapp: { allowFrom: ["*"] } } };
    params.messageChannel = "whatsapp";
    params.senderIsOwner = false;
    const sendText = vi.fn(async () => ({ channel: "whatsapp", messageId: "continued-reply" }));
    const channel = createOutboundTestPlugin({
      id: "whatsapp",
      capabilities: { chatTypes: ["direct"] },
      outbound: {
        deliveryMode: "direct",
        resolveTarget: ({ to }) => ({ ok: true, to: to ?? "+12025550123" }),
        sendText,
      },
    });
    channel.config.listAccountIds = () => ["default"];
    const previousRegistry = getActivePluginRegistry();
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "whatsapp", source: "test", plugin: channel }]),
    );
    const factory = vi.fn((options: ToolOptions | undefined) => createOpenClawCodingTools(options));
    setCodexTestToolFactory(params, factory);
    const registration = {
      catalogOnly: true,
      forceHeartbeatTool: true,
      forceMessageTool: true,
      ignoreDisableMessageTool: true,
      ignoreRuntimePlan: true,
      sandbox: null as never,
    };
    const makeBridge = (
      tools: RuntimeDynamicToolForTest[],
      registeredTools: RuntimeDynamicToolForTest[],
    ) =>
      createCodexDynamicToolBridge({
        tools,
        registeredTools,
        signal: new AbortController().signal,
      });
    const call = {
      threadId: "parent",
      turnId: "completion",
      callId: "message-continuity",
      namespace: null,
      tool: "message",
      arguments: {
        action: "send",
        channel: "whatsapp",
        target: "+12025550123",
        message: "Child work complete.",
        final: true,
      },
    };
    try {
      params.sourceReplyDeliveryMode = "automatic";
      const firstRegistered = await buildDynamicToolsForTest(params, workspaceDir, registration);
      expect(firstRegistered.map((tool) => tool.name)).toContain("message");
      params.sourceReplyDeliveryMode = "message_tool_only";
      const requiredRegistered = await buildDynamicToolsForTest(params, workspaceDir, registration);
      params.sourceReplyDeliveryMode = "automatic";
      params.disableMessageTool = true;
      const completionRegistered = await buildDynamicToolsForTest(
        params,
        workspaceDir,
        registration,
      );
      const completionTools = await buildDynamicToolsForTest(params, workspaceDir, {
        sandbox: null as never,
      });
      const firstBridge = makeBridge([], firstRegistered);
      expect(makeBridge([], requiredRegistered).specs).toEqual(firstBridge.specs);
      const completionBridge = makeBridge(completionTools, completionRegistered);
      expect(completionBridge.specs).toEqual(firstBridge.specs);
      expect(completionBridge.availableTools.map((tool) => tool.name)).not.toContain("message");
      expect(await completionBridge.handleToolCall(call)).toMatchObject({ success: false });
      expect(sendText).not.toHaveBeenCalled();
      params.disableMessageTool = false;
      params.sourceReplyDeliveryMode = "message_tool_only";
      const laterTools = await buildDynamicToolsForTest(params, workspaceDir, {
        sandbox: null as never,
      });
      const laterBridge = makeBridge(laterTools, firstRegistered);
      expect(laterBridge.availableTools.map((tool) => tool.name)).toContain("message");
      const result = await laterBridge.handleToolCall({
        ...call,
        turnId: "later",
        callId: "later-message",
      });
      expect(result.success, JSON.stringify(result.contentItems)).toBe(true);
      expect(sendText).toHaveBeenCalledOnce();
      expect(factory.mock.calls.every(([options]) => options?.senderIsOwner === false)).toBe(true);
      params.config.tools = { profile: "coding", deny: ["message"] };
      const deniedRegistered = await buildDynamicToolsForTest(params, workspaceDir, registration);
      const deniedTools = await buildDynamicToolsForTest(params, workspaceDir, {
        sandbox: null as never,
      });
      expect(deniedRegistered.map((tool) => tool.name)).not.toContain("message");
      expect(
        await makeBridge(deniedTools, firstRegistered).handleToolCall({
          ...call,
          turnId: "denied",
          callId: "denied-message",
        }),
      ).toMatchObject({ success: false });
      expect(sendText).toHaveBeenCalledOnce();
    } finally {
      if (previousRegistry) {
        setActivePluginRegistry(previousRegistry);
      } else {
        resetPluginRuntimeStateForTest();
      }
    }
  });

  it("keeps owner declarations stable while completion executors retain current authority", async () => {
    const workspaceDir = path.join(tempDir, "owner-continuity");
    const params = createParams(path.join(tempDir, "owner-continuity.jsonl"), workspaceDir);
    params.config = { tools: { allow: ["computer", "sessions"] } };
    params.model = { ...params.model, input: ["text", "image"] };
    setCodexTestToolFactory(params, createOpenClawCodingTools);
    const registration = { catalogOnly: true, ignoreRuntimePlan: true, sandbox: null as never };
    params.senderIsOwner = true;
    const ownerCatalog = await buildDynamicToolsForTest(params, workspaceDir, registration);
    const ownerBridge = createCodexDynamicToolBridge({
      tools: [],
      registeredTools: ownerCatalog,
      signal: new AbortController().signal,
    });
    params.senderIsOwner = false;
    const internalCatalog = await buildDynamicToolsForTest(params, workspaceDir, registration);
    const executors = await buildDynamicToolsForTest(params, workspaceDir, {
      sandbox: null as never,
    });
    const bridge = createCodexDynamicToolBridge({
      tools: executors,
      registeredTools: internalCatalog,
      signal: new AbortController().signal,
    });
    expect(ownerCatalog.map((tool) => tool.name)).toContain("computer");
    expect(bridge.specs).toEqual(ownerBridge.specs);
    expect(bridge.availableTools.map((tool) => tool.name)).not.toContain("computer");
    expect(
      await bridge.handleToolCall({
        threadId: "parent",
        turnId: "completion",
        callId: "denied-computer",
        namespace: CODEX_OPENCLAW_DIRECT_DYNAMIC_TOOL_NAMESPACE,
        tool: "computer",
        arguments: {},
      }),
    ).toMatchObject({ success: false });
    params.config = { tools: { allow: ["computer", "sessions"], deny: ["computer"] } };
    const deniedCatalog = await buildDynamicToolsForTest(params, workspaceDir, registration);
    expect(deniedCatalog.map((tool) => tool.name)).not.toContain("computer");
  });

  it("preserves webchat chat.send declarations through a callerless completion", async () => {
    const workspaceDir = path.join(tempDir, "webchat-continuity");
    const params = createParams(path.join(tempDir, "webchat-continuity.jsonl"), workspaceDir);
    params.sessionKey = "agent:main:gateway-continuation-probe";
    params.config = { tools: { allow: ["message"] } };
    params.messageChannel = "webchat";
    params.messageProvider = "webchat";
    params.senderIsOwner = true;
    setCodexTestToolFactory(params, createOpenClawCodingTools);
    const registration = {
      catalogOnly: true,
      forceMessageTool: true,
      ignoreDisableMessageTool: true,
      ignoreRuntimePlan: true,
      sandbox: null as never,
    };
    const makeBridge = (
      tools: RuntimeDynamicToolForTest[],
      registeredTools: RuntimeDynamicToolForTest[],
    ) =>
      createCodexDynamicToolBridge({
        tools,
        registeredTools,
        signal: new AbortController().signal,
      });
    const initialCatalog = await buildDynamicToolsForTest(params, workspaceDir, registration);
    const initialTools = await buildDynamicToolsForTest(params, workspaceDir, {
      sandbox: null as never,
    });
    const initialBridge = makeBridge(initialTools, initialCatalog);
    const initialMessage = initialCatalog.find((tool) => tool.name === "message");
    expect(initialMessage?.parameters).toHaveProperty("properties.clawhub");
    params.messageChannel = undefined;
    params.messageProvider = undefined;
    params.senderIsOwner = false;
    params.disableMessageTool = true;
    const completionCatalog = await buildDynamicToolsForTest(params, workspaceDir, registration);
    const completionTools = await buildDynamicToolsForTest(params, workspaceDir, {
      sandbox: null as never,
    });
    const completionBridge = makeBridge(completionTools, completionCatalog);
    expect(completionBridge.specs).toEqual(initialBridge.specs);
    expect(completionBridge.availableTools.map((tool) => tool.name)).not.toContain("message");
    const call = {
      threadId: "parent",
      turnId: "completion",
      callId: "source-message",
      namespace: null,
      tool: "message",
      arguments: { action: "broadcast", targets: ["elsewhere"], message: "blocked" },
    };
    expect(await completionBridge.handleToolCall(call)).toMatchObject({ success: false });
    // The durable catalog must not broaden the current webchat executor's actions.
    expect(await initialBridge.handleToolCall({ ...call, turnId: "webchat" })).toMatchObject({
      success: false,
    });
    params.config = { tools: { allow: ["message"], message: { actions: { allow: ["send"] } } } };
    const actionRestricted = await buildDynamicToolsForTest(params, workspaceDir, registration);
    expect(actionRestricted.find((tool) => tool.name === "message")?.parameters).toHaveProperty(
      "properties.action.enum",
      ["send"],
    );
    params.config = { tools: { allow: ["message"], deny: ["message"] } };
    expect(
      (await buildDynamicToolsForTest(params, workspaceDir, registration)).map((tool) => tool.name),
    ).not.toContain("message");
  });
});
