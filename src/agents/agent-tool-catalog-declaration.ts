import { copyPluginToolMeta } from "../plugins/tool-metadata.js";
import type { AnyAgentTool } from "./agent-tools.types.js";

/** Immutable native catalogs describe configured tools, never retain turn executors. */
export function createAgentToolCatalogDeclaration(tool: AnyAgentTool): AnyAgentTool {
  const declaration: AnyAgentTool = {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
    outputSchema: tool.outputSchema,
    catalogMode: tool.catalogMode,
    displaySummary: tool.displaySummary,
    requiredClientCaps: tool.requiredClientCaps,
    execute: async () => {
      throw new Error("A catalog-only tool declaration cannot execute");
    },
  };
  // Ownership is schema metadata. Execution preparers or wrappers could replace
  // the rejecting executor, so do not copy them from the live tool.
  copyPluginToolMeta(tool, declaration);
  return declaration;
}
