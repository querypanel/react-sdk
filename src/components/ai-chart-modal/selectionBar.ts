import type { MastraChartMessage } from "./types";

/** The turn the docked "Add selected / Add report" bar acts on: the latest assistant turn with a chart. */
export function selectableTurn(
	messages: ReadonlyArray<MastraChartMessage>,
	reportMode: boolean,
): MastraChartMessage | null {
	if (!reportMode) return null;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i]!;
		if (message.role !== "assistant") continue;
		return message.kind === "turn" && message.blocks?.some((b) => b.type === "viz") ? message : null;
	}
	return null;
}

/** Ids of charts that are ticked and not yet on the dashboard. */
export function pendingSelectedVizIds(
	message: MastraChartMessage,
	isSelected: (vizId: string) => boolean,
	isAdded: (vizId: string) => boolean,
): string[] {
	return (message.blocks ?? [])
		.filter((b) => b.type === "viz" && isSelected(b.id) && !isAdded(b.id))
		.map((b) => b.id);
}
