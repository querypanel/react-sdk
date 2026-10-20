import { describe, expect, it } from "vitest";
import { pendingSelectedVizIds, selectableTurn } from "./selectionBar";
import type { MastraChartMessage } from "./types";

const viz = (id: string) => ({ id, type: "viz" as const });
const turn = (id: string, blocks: MastraChartMessage["blocks"]): MastraChartMessage => ({
	id,
	role: "assistant",
	kind: "turn",
	content: "",
	blocks,
	timestamp: new Date(0),
});
const user: MastraChartMessage = { id: "u", role: "user", content: "q", timestamp: new Date(0) };

describe("selectableTurn", () => {
	it("returns the latest assistant turn when it has a chart, even a single one", () => {
		const latest = turn("b", [viz("v1")]);
		expect(selectableTurn([user, turn("a", [viz("x"), viz("y")]), user, latest], true)).toBe(latest);
	});
	it("is null outside report mode, without charts, or when the latest assistant turn has none", () => {
		expect(selectableTurn([user, turn("a", [viz("x")])], false)).toBeNull();
		expect(selectableTurn([user, turn("a", [{ id: "t", type: "text", content: "hi" }])], true)).toBeNull();
		expect(selectableTurn([turn("a", [viz("x")]), user, turn("b", [])], true)).toBeNull();
		expect(selectableTurn([user], true)).toBeNull();
	});
});

describe("pendingSelectedVizIds", () => {
	it("keeps selected charts and drops already-added ones", () => {
		const message = turn("a", [viz("v1"), viz("v2"), viz("v3"), { id: "t", type: "text", content: "x" }]);
		const ids = pendingSelectedVizIds(message, (id) => id !== "v2", (id) => id === "v3");
		expect(ids).toEqual(["v1"]);
	});
});
