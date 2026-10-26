import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { resolveOwnerPromptNumbers } from "../agents/owner-display.js";
import { buildAgentSystemPrompt } from "../agents/system-prompt.js";
import type { OpenClawConfig } from "../config/config.js";
import {
  isResetAuthorizedForContext,
  resolveCommandAuthorization as authorize,
} from "./command-auth.js";
import type { MsgContext } from "./templating.js";
import { installDiscordRegistryHooks } from "./test-helpers/command-auth-registry-fixture.js";

installDiscordRegistryHooks();

const discordConfig = (owners?: string[]): OpenClawConfig => ({
  channels: { discord: {} },
  ...(owners && { commands: { ownerAllowFrom: owners } }),
});
const sender = (id: string, extra: Partial<MsgContext> = {}, provider = "discord"): MsgContext => ({
  Provider: provider,
  Surface: provider,
  From: `${provider}:${id}`,
  SenderId: id,
  ...extra,
});
const telegramGroup = sender(
  "200482621",
  {
    ChatType: "group",
    From: "telegram:group:-100123",
    CommandSource: "native",
  },
  "telegram",
);
const nonOwner = { senderIsOwner: false, isAuthorizedSender: true };
const telegramConfig = { channels: { telegram: {} } };

it.each([{ allowFrom: ["*"] }, { allowFrom: ["456"] }])(
  "suppresses commands but retains owner identity: $allowFrom",
  async ({ allowFrom }) => {
    const cfg = { commands: { ownerAllowFrom: ["456"], allowFrom: { "*": allowFrom } } };
    const ctx = sender("456", { From: undefined, CommandInterpretationSuppressed: true });
    const params = { ctx, cfg, commandAuthorized: true };

    expect(authorize(params)).toMatchObject({
      senderId: "456",
      senderIsOwner: true,
      isAuthorizedSender: false,
    });
    expect(await isResetAuthorizedForContext(params)).toBe(false);
    ctx.CommandInterpretationSuppressed = false;
    expect(authorize(params).isAuthorizedSender).toBe(true);
    expect(await isResetAuthorizedForContext(params)).toBe(true);
  },
);

it.each<[string, OpenClawConfig, MsgContext, Partial<ReturnType<typeof authorize>>]>([
  ["direct is not owner", discordConfig(), sender("123", { ChatType: "direct" }), nonOwner],
  ["group is not owner", discordConfig(), sender("123", { ChatType: "group" }), nonOwner],
  ["native group authorization", telegramConfig, telegramGroup, nonOwner],
  [
    "channel allowlist is not ownership",
    { channels: { telegram: { allowFrom: ["200482621"] } } },
    sender("200482621", { ChatType: "direct" }, "telegram"),
    { ownerList: [], ...nonOwner },
  ],
  [
    "native cannot bypass owner allowlist",
    { ...telegramConfig, commands: { ownerAllowFrom: ["456"] } },
    telegramGroup,
    { senderIsOwner: false, isAuthorizedSender: false },
  ],
  [
    "wildcard is not ownership",
    discordConfig(["*"]),
    sender("anyone"),
    { ownerList: [], ...nonOwner },
  ],
  [
    "internal admin is owner",
    {},
    { Provider: "webchat", Surface: "webchat", GatewayClientScopes: ["operator.admin"] },
    { senderIsOwner: true },
  ],
])("%s", (_name, cfg, ctx, expected) => {
  expect(authorize({ ctx, cfg, commandAuthorized: true })).toMatchObject(expected);
});

it("keeps a large owner allowlist authorized without exhausting the model prompt", () => {
  const ownerIds = Array.from({ length: 9_282 }, (_, index) =>
    String(100_000_000_000_000_000n + BigInt(index)),
  );
  const ownerId = ownerIds.at(-1)!;
  const cfg = discordConfig(ownerIds.map((id) => `discord:${id}`));
  const context = sender(ownerId, { ChatType: "direct", SenderId: `<@!${ownerId}>` });
  const resolve = () => authorize({ cfg, commandAuthorized: true, ctx: context });
  const auth = resolve();

  expect(auth.ownerList).toHaveLength(ownerIds.length);
  expect(auth).toMatchObject({
    senderId: ownerId,
    senderIsOwner: true,
    isAuthorizedSender: true,
  });

  const promptParams = {
    workspaceDir: "/tmp/openclaw",
    ownerNumbers: resolveOwnerPromptNumbers({ ownerNumbers: auth.ownerList, ...auth }),
    runtimeInfo: { channel: "discord" },
  };
  const prompt = buildAgentSystemPrompt(promptParams);
  const ownerLine = prompt.split("## Authorized Senders\n")[1]?.split("\n")[0] ?? "";

  expect(ownerLine).toContain(ownerId);
  expect(Buffer.byteLength(ownerLine, "utf8")).toBeLessThanOrEqual(1_024);

  const hashedPrompt = buildAgentSystemPrompt({ ...promptParams, ownerDisplay: "hash" });
  const ownerHash = createHash("sha256").update(ownerId).digest("hex").slice(0, 12);
  expect(hashedPrompt).toContain(ownerHash);
  expect(hashedPrompt).not.toContain(ownerId);

  cfg.commands?.ownerAllowFrom?.pop();
  const revoked = resolve();
  expect(revoked.ownerList).toHaveLength(ownerIds.length - 1);
  expect(revoked).toMatchObject({ senderIsOwner: false, isAuthorizedSender: false });
});
