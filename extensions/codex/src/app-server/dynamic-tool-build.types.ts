import type {
  EmbeddedRunAttemptParamsV2 as EmbeddedRunAttemptParams,
  resolveSandboxContext,
} from "openclaw/plugin-sdk/agent-harness-runtime";
import type { CodexComputerContextEpoch } from "./computer-context.js";
import type { CodexPluginConfig } from "./config.js";
import type { createCodexHostToolSurface } from "./dynamic-tool-construction-plan.js";
import type { CodexEffectiveSessionPermissionPolicy } from "./session-permission-policy.js";
import type { NodeExecAvailabilityRef } from "./shell-dynamic-tools.js";
import type { CodexNativeWebSearchSupport } from "./web-search.js";
export type OpenClawCodingToolsOptions = NonNullable<
  Parameters<
    (typeof import("openclaw/plugin-sdk/agent-harness"))["createOpenClawCodingToolsAsync"]
  >[0]
>;

/** Factory seam for constructing OpenClaw runtime tools without eagerly loading agent-harness. */
type OpenClawCodingToolsFactory =
  (typeof import("openclaw/plugin-sdk/agent-harness"))["createOpenClawCodingToolsAsync"];
export type OpenClawDynamicTool = Awaited<ReturnType<OpenClawCodingToolsFactory>>[number];
export type OpenClawSandboxContext = Awaited<ReturnType<typeof resolveSandboxContext>>;
type CodexDynamicToolBuildEvent = Parameters<
  NonNullable<EmbeddedRunAttemptParams["onAgentEvent"]>
>[0];
export type DynamicToolBuildParams = {
  params: EmbeddedRunAttemptParams;
  resolvedWorkspace: string;
  effectiveWorkspace: string;
  effectiveCwd?: string;
  sandboxSessionKey: string;
  sandbox: OpenClawSandboxContext;
  sessionPermissionPolicy?: CodexEffectiveSessionPermissionPolicy;
  nativeToolSurfaceEnabled?: boolean;
  nativeProviderWebSearchSupport?: CodexNativeWebSearchSupport;
  runAbortController: AbortController;
  nodeExecAvailability?: NodeExecAvailabilityRef;
  sessionAgentId: string;
  policyAgentId: string;
  pluginConfig: CodexPluginConfig;
  profilerEnabled?: boolean;
  cronCreatorToolAllowlistRef?: OpenClawCodingToolsOptions["cronCreatorToolAllowlistRef"];
  cronCreatorToolAllowlistCaptureRef?: OpenClawCodingToolsOptions["cronCreatorToolAllowlistCaptureRef"];
  resolveCronCreatorToolAuthority?: Parameters<typeof createCodexHostToolSurface>[3];
  cronCreatorAuthorityUnavailableReason?: OpenClawCodingToolsOptions["cronCreatorAuthorityUnavailableReason"];
  forceHeartbeatTool?: boolean;
  forceMessageTool?: boolean;
  /** Inert declarations only; current executors retain their authority. */
  catalogOnly?: boolean;
  ignoreDisableMessageTool?: boolean;
  ignoreRuntimePlan?: boolean;
  /** Host fact resolver; injectable only for focused plugin contract tests. */
  isHostScopedToolActive?: (toolName: string) => boolean;
  onYieldDetected: (message: string, acknowledgment?: string) => void;
  claimYieldCompletion?: OpenClawCodingToolsOptions["claimYieldCompletion"];
  onCodexAppServerEvent?: (event: CodexDynamicToolBuildEvent) => void;
  onPersistentWebSearchPolicyResolved?: (allowed: boolean) => void;
  onWebSearchPolicyResolved?: (allowed: boolean) => void;
  onMessageToolTargetResolved?: (requireExplicitMessageTarget: boolean) => void;
  computerContextEpoch?: CodexComputerContextEpoch;
  registerRunCleanup?: OpenClawCodingToolsOptions["registerRunCleanup"];
};
