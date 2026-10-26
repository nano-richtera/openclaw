import { describe, expect, it } from "vitest";
import {
  bindAgentToolReplaySafety,
  collectReplaySafeToolNames,
  collectSideEffectToolOwners,
  isAgentToolReplaySafe as replaySafe,
  isAgentToolRestartSafe as restartSafe,
} from "./tool-replay-safety.js";
import { TOOL_CALL_RAW_TOOL_NAME } from "./tool-search-types.js";

const declared = (value: boolean) => ({ declaredReplaySafe: () => value });

describe("agent tool replay safety", () => {
  it("allows only audited unconditional core tools", () => {
    expect(
      ["search", "progress_card", "process", "vendor_widget"].map((name) => replaySafe({ name })),
    ).toEqual([true, false, false, false]);
  });

  it("requires extension-owned tools to opt in even when they reuse an audited name", () => {
    const pluginTool = { name: "search" };
    expect(replaySafe(pluginTool, declared(false))).toBe(false);
  });

  it("accepts opted-in extension tools only for audited names", () => {
    expect(replaySafe({ name: "x_search" }, declared(true))).toBe(true);
    expect(replaySafe({ name: "vendor_widget" }, declared(true))).toBe(false);
  });

  it("accepts owner-declared concrete tools for restart-safe turns", () => {
    const pluginTool = { name: "vendor_widget" };

    expect(restartSafe(pluginTool, declared(true))).toBe(true);
    expect(restartSafe(pluginTool, declared(false))).toBe(false);
  });

  it("admits only the concrete Tool Search dispatcher for explicit restart recovery", () => {
    const dispatcher = bindAgentToolReplaySafety({ name: TOOL_CALL_RAW_TOOL_NAME }, "dispatcher");

    expect(restartSafe(dispatcher)).toBe(true);
    expect(replaySafe(dispatcher)).toBe(false);
    expect(restartSafe({ name: TOOL_CALL_RAW_TOOL_NAME })).toBe(false);
    expect(restartSafe({ ...dispatcher })).toBe(false);
    for (const name of ["exec", "wait", "tool_call", "other_dispatcher"]) {
      expect(restartSafe(bindAgentToolReplaySafety({ name }, "dispatcher")), name).toBe(false);
    }
    expect(restartSafe(dispatcher, declared(false))).toBe(false);
  });

  it("binds read-only recovery safety to the concrete variant rather than its historical name", () => {
    const reader = bindAgentToolReplaySafety({ name: "automations" }, "bounded-read");
    const ordinaryTool = { name: "automations" };

    expect(replaySafe(reader)).toBe(true);
    expect(replaySafe(ordinaryTool)).toBe(false);
    expect(replaySafe({ ...reader })).toBe(false);
    expect(replaySafe(reader, declared(false))).toBe(false);
    expect(collectReplaySafeToolNames([reader, ordinaryTool])).toEqual(new Set());
  });

  it("rejects memory_search because it records durable recall signals", () => {
    expect(replaySafe({ name: "memory_search" }, declared(true))).toBe(false);
  });

  it("rejects duplicate names from name-only replay metadata", () => {
    const coreTool = { name: "search" };
    const pluginTool = { name: "search" };

    expect(
      collectReplaySafeToolNames([coreTool, pluginTool], {
        declaredReplaySafe: (tool) => (tool === pluginTool ? true : undefined),
      }),
    ).toEqual(new Set());
  });

  it("retains canonical owners only for unique side-effecting tool names", () => {
    const memoryStore = { name: "memory_store" };
    const unrelatedStore = { name: "vendor_store" };
    const shadowedStore = { name: "memory_store" };
    const options = {
      declaredOwner: (tool: { name?: string }) =>
        tool === memoryStore ? '["memory-lancedb","memory_store"]' : undefined,
    };
    expect(
      collectSideEffectToolOwners([memoryStore, unrelatedStore, shadowedStore], options),
    ).toEqual(new Map());
    expect(collectSideEffectToolOwners([memoryStore, unrelatedStore], options)).toEqual(
      new Map([["memory_store", '["memory-lancedb","memory_store"]']]),
    );
  });
});
