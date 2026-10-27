import type { PreparedMessageToolCatalog } from "../../channels/plugins/message-action-discovery.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { getPreparedMessageToolCatalog } from "../../plugins/prepared-message-tool-catalog.js";
import { resolveSessionAgentId } from "../agent-scope.js";
import type { AnyAgentTool } from "./common.js";
import {
  buildMessageToolDescription,
  buildMessageToolSchema,
  resolveMessageToolActionSchemaActions,
  type MessageToolDiscoveryParams,
} from "./message-tool-discovery.js";
import { MessageToolSchema } from "./message-tool-schema.js";
import {
  addSourceReplyFinalControl,
  SOURCE_REPLY_ONLY_MESSAGE_SCHEMA,
} from "./message-tool-source-policy.js";

/** Resolve schema and prompt from one discovery snapshot. */
export function buildMessageToolDefinition(
  discovery: MessageToolDiscoveryParams | undefined,
  sourceReplyOnly = false,
): Pick<AnyAgentTool, "parameters" | "description"> {
  const actions = discovery ? resolveMessageToolActionSchemaActions(discovery) : undefined;
  const baseSchema = sourceReplyOnly
    ? SOURCE_REPLY_ONLY_MESSAGE_SCHEMA
    : discovery
      ? buildMessageToolSchema(discovery, actions ?? [])
      : MessageToolSchema;
  return {
    parameters: addSourceReplyFinalControl(baseSchema),
    description: sourceReplyOnly
      ? "Send a message to the current source conversation. Supports actions: send."
      : buildMessageToolDescription(actions),
  };
}

export function createMessageToolCatalog(options: {
  config: OpenClawConfig;
  agentId?: string;
  agentSessionKey?: string;
  preparedMessageToolCatalog?: PreparedMessageToolCatalog;
}): AnyAgentTool {
  // A declaration covers configured channels, not one turn's delivery route.
  // Never borrow source or caller authority to make the schema persistent.
  const discovery: MessageToolDiscoveryParams = {
    cfg: options.config,
    catalogOnly: true,
    agentId:
      options.agentId ??
      (options.agentSessionKey
        ? resolveSessionAgentId({ sessionKey: options.agentSessionKey, config: options.config })
        : undefined),
    preparedMessageToolCatalog:
      options.preparedMessageToolCatalog ?? getPreparedMessageToolCatalog(),
  };
  return {
    name: "message",
    label: "Message",
    displaySummary: "Send and manage messages across configured channels.",
    ...buildMessageToolDefinition(discovery),
    execute: async () => {
      throw new Error("A catalog-only message declaration cannot execute");
    },
  };
}
