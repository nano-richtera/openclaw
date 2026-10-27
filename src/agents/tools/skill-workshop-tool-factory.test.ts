import { Value } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import type { SkillLibraryAuthoringCapability } from "../../skills/library/authoring.js";
import {
  createConfiguredSkillWorkshopTool,
  type SkillWorkshopRunOptions,
} from "./skill-workshop-tool-factory.js";
import { createSkillWorkshopTool } from "./skill-workshop-tool.js";

vi.mock("./skill-workshop-tool.js", () => ({ createSkillWorkshopTool: vi.fn() }));

describe("Workshop catalog declarations", () => {
  it("keeps declarations stable across user, completion, and review without binding authority", async () => {
    const invoke = vi.fn();
    const bind = vi.fn();
    const library: SkillLibraryAuthoringCapability = {
      target: "personal",
      defaultTarget: "workspace",
      multipleProfiles: true,
      invoke,
      bind,
    };
    const runs: (SkillWorkshopRunOptions | undefined)[] = [
      { libraryAuthoring: library },
      undefined,
      { libraryAuthoring: { ...library, multipleProfiles: false, defaultTarget: "personal" } },
      { reviewOf: "agent:main:original" },
    ];
    const tools = runs.map((run) =>
      createConfiguredSkillWorkshopTool({
        config: {},
        agentId: "main",
        catalogOnly: true,
        run,
      }),
    );
    for (const tool of tools) {
      expect(tool.description).toBe(tools[0]!.description);
      expect(tool.parameters).toEqual(tools[0]!.parameters);
      expect(Value.Check(tool.parameters, { action: "view", name: "learned-skill" })).toBe(true);
      expect(
        Value.Check(tool.parameters, { action: "share", target: "personal", skill_id: "skill" }),
      ).toBe(true);
      expect(Value.Check(tool.parameters, { action: "share" })).toBe(false);
      await expect(tool.execute("catalog", { action: "list" })).rejects.toThrow(
        "catalog declarations cannot execute",
      );
    }
    expect(createSkillWorkshopTool).not.toHaveBeenCalled();
    expect(bind).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps sandbox discovery personal-only without workspace authority", async () => {
    const tool = createConfiguredSkillWorkshopTool({
      config: {},
      agentId: "main",
      catalogOnly: true,
      sandboxed: true,
    });
    expect(Value.Check(tool.parameters, { action: "view", name: "learned-skill" })).toBe(false);
    expect(Value.Check(tool.parameters, { action: "read", skill_id: "skill" })).toBe(true);
    await expect(tool.execute("catalog", { action: "read", skill_id: "skill" })).rejects.toThrow(
      "catalog declarations cannot execute",
    );
    expect(createSkillWorkshopTool).not.toHaveBeenCalled();
  });
});
