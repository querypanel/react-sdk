import { describe, expect, it } from "vitest";
import { fetchTagIntent } from "./tagIntent";

const input = { question: "q", tagged: [{ title: "A", sql: "s", kind: "chart" }] };
const respond = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status });

describe("fetchTagIntent", () => {
  it("returns the API decision", async () => {
    const decision = await fetchTagIntent("/x", {}, input, respond(200, { intent: "modify", source: "jev", confidence: 0.9 }));
    expect(decision).toMatchObject({ intent: "modify", source: "jev" });
  });

  it("falls back to asking on HTTP errors, bad bodies and network failures", async () => {
    for (const impl of [
      respond(500, {}),
      respond(200, { intent: "delete" }),
      async () => {
        throw new Error("offline");
      },
    ]) {
      const decision = await fetchTagIntent("/x", {}, input, impl);
      expect(decision).toMatchObject({ intent: "ask", options: ["investigate", "modify", "replace"] });
    }
  });

  it("only offers investigate to ask about several charts", async () => {
    const two = { ...input, tagged: [...input.tagged, ...input.tagged] };
    const decision = await fetchTagIntent("/x", {}, two, respond(500, {}));
    expect(decision.options).toEqual(["investigate"]);
  });
});
