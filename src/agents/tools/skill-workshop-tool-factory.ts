import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { SkillLibraryAuthoringCapability } from "../../skills/library/authoring.js";
import { ToolInputError, type AnyAgentTool } from "./common.js";
import { SKILL_WORKSHOP_DESCRIPTION } from "./skill-workshop-tool-description.js";
import { buildLibrarySkillWorkshopDefinition } from "./skill-workshop-tool-library-definition.js";
import { createLibrarySkillWorkshopTool } from "./skill-workshop-tool-library.js";
import { SkillWorkshopToolSchema } from "./skill-workshop-tool-schema.js";
import { createSkillWorkshopTool } from "./skill-workshop-tool.js";

/** Run-scoped Workshop authority chosen by the run owner, never by tool arguments. */
export type SkillWorkshopRunOptions = {
  /** Originating session of a background review; turns on the review guard. */
  reviewOf?: string;
  libraryAuthoring?: SkillLibraryAuthoringCapability;
};

export function createConfiguredSkillWorkshopTool(params: {
  config: OpenClawConfig;
  agentId: string;
  sessionKey?: string;
  runId?: string;
  run?: SkillWorkshopRunOptions;
  sandboxed?: boolean;
  catalogOnly?: boolean;
}): AnyAgentTool {
  if (params.catalogOnly) {
    const definition = buildLibrarySkillWorkshopDefinition(
      false,
      params.sandboxed
        ? undefined
        : {
            description: SKILL_WORKSHOP_DESCRIPTION,
            parameters: SkillWorkshopToolSchema,
          },
    );
    return {
      ...definition,
      description: `${definition.description} Available actions depend on current run authority. Personal operations require current personal-library authority; team sharing and transfer additionally require current permissions.`,
      execute: async () => {
        throw new ToolInputError("Skill Workshop catalog declarations cannot execute.");
      },
    };
  }
  const sessionKey = normalizeOptionalString(params.sessionKey);
  const runId = normalizeOptionalString(params.runId);
  const createWorkshop = () =>
    createSkillWorkshopTool({
      config: params.config,
      agentId: params.agentId,
      ...(sessionKey ? { sessionKey } : {}),
      ...(runId ? { runId } : {}),
      ...(params.run?.reviewOf ? { reviewOf: params.run.reviewOf } : {}),
    });
  const libraryAuthoring = params.run?.libraryAuthoring;
  if (!libraryAuthoring) {
    return createWorkshop();
  }
  return createLibrarySkillWorkshopTool(
    libraryAuthoring,
    libraryAuthoring.defaultTarget === "workspace" ? createWorkshop() : undefined,
    { sandboxed: params.sandboxed },
  );
}
