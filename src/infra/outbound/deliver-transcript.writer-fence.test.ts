import { beforeEach, expect, it, vi } from "vitest";
import { withinTest } from "../../../test/helpers/promise.js";
import { createEnteredGate } from "../../agents/entered-gate.test-support.js";
import { withOwnedSessionTranscriptWrites } from "../../config/sessions/transcript-write-context.js";
import {
  getActiveGatewayRootWorkCount,
  getActiveGatewayRootWorkHolders,
  runWithGatewayIndependentRootWorkAdmission,
} from "../../process/gateway-work-admission.js";
import { withSessionTurn } from "../../sessions/session-controller.admission.js";
import { AsyncWorkScope, getAsyncWorkSignal } from "../../shared/async-work-scope.js";
import { mirrorDeliveredPayloads } from "./deliver-transcript.js";

const { append } = vi.hoisted(() => ({
  append: vi.fn(async (_params: Record<string, unknown>) => ({ ok: true }) as const),
}));
vi.mock("../../config/sessions/transcript.runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config/sessions/transcript.runtime.js")>()),
  appendAssistantMessageToSessionTranscript: append,
}));

const target = {
  agentId: "wolf",
  sessionKey: "agent:wolf:main",
  storePath: "/state/agents/wolf/openclaw-agent.sqlite",
};
const fence = { expectedWriterRunId: "run-running", expectedLifecycleRevision: "rev-7" };
const withWriter = (run: () => Promise<void>) =>
  withOwnedSessionTranscriptWrites(
    {
      sessionKey: target.sessionKey,
      sessionTarget: { ...target, ...fence },
      withTranscriptWrite: async (operation) => await operation(),
    },
    run,
  );
const mirror = (sessionKey = target.sessionKey, deferToSessionLane = false) =>
  mirrorDeliveredPayloads({
    delivery: {
      cfg: { session: { store: target.storePath } },
      channel: "discord",
      to: "recipient",
      mirror: { agentId: target.agentId, sessionKey, deferToSessionLane },
    },
    payloads: [{ text: "delivered to the user", mediaUrls: [] }],
  });

beforeEach(() => append.mockClear().mockResolvedValue({ ok: true }));

it.each([
  { sessionKey: target.sessionKey, owned: true },
  { sessionKey: "agent:arthur:main", owned: true },
  { sessionKey: target.sessionKey, owned: false },
])("fences $sessionKey (owned: $owned)", async ({ sessionKey, owned }) => {
  const run = () => mirror(sessionKey);
  await (owned ? withWriter(run) : run());
  const args = append.mock.calls[0]?.[0];
  expect(args).toMatchObject({ sessionKey });
  if (owned && sessionKey === target.sessionKey) {
    expect(args).toMatchObject(fence);
  } else {
    expect(args).not.toHaveProperty("expectedWriterRunId");
    expect(args).not.toHaveProperty("expectedLifecycleRevision");
  }
});

it("retains shutdown custody, not the sender's scope or writer", async ({ signal }) => {
  const gate = createEnteredGate();
  const turn = withSessionTurn({ ...target, sessionId: "running-requester" }, gate.wait);
  const work = new AsyncWorkScope();
  const appendSignals: Array<AbortSignal | undefined> = [];
  append.mockImplementation(async () => {
    appendSignals.push(getAsyncWorkSignal());
    return { ok: true } as const;
  });
  try {
    await withinTest(gate.entered, signal);
    const deliver = () =>
      runWithGatewayIndependentRootWorkAdmission(
        () => mirror(target.sessionKey, true),
        "direct-delivery",
      );
    await withinTest(
      withWriter(() => work.track(deliver)),
      signal,
    );
    await work.drain();
    expect(getActiveGatewayRootWorkHolders()).toEqual(["direct-delivery"]);
    expect(append).not.toHaveBeenCalled();
    gate.release();
    await withinTest(turn, signal);
    await vi.waitFor(() => expect(append).toHaveBeenCalledOnce());
    expect(appendSignals).toEqual([undefined]);
    expect(append.mock.calls[0]?.[0]).not.toHaveProperty("expectedWriterRunId");
    await vi.waitFor(() => expect(getActiveGatewayRootWorkCount()).toBe(0));
  } finally {
    gate.release();
    await Promise.allSettled([turn]);
  }
});
