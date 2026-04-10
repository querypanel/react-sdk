import "../helpers/config.helper";
import { describe, expect, mock, test } from "bun:test";
import { RequestContext } from "@mastra/core/di";

async function getSqlAgent() {
	const module = await import("../../src/mastra/agents/sql-agent");
	return module.sqlAgent;
}

describe("sqlAgent", () => {
	test("requires tool usage by default", async () => {
		const sqlAgent = await getSqlAgent();
		const options = await sqlAgent.getDefaultOptions();

		expect(options.toolChoice).toBe("required");
	});

	test("includes runtime request context in instructions", async () => {
		const sqlAgent = await getSqlAgent();
		const requestContext = new RequestContext({
			organizationId: "149c3cc2-7f9e-49d0-950d-9a84aa3dd76c",
			datasourceId: "44b92908-98cb-4e5e-a429-bccd63f8090f",
			tenantId: "1",
		});

		const instructions = await sqlAgent.getInstructions({ requestContext });
		const instructionText = Array.isArray(instructions)
			? instructions
					.map((message) =>
						typeof message === "string" ? message : String(message.content),
					)
					.join("\n")
			: typeof instructions === "string"
				? instructions
				: String(instructions.content);

		expect(instructionText).toContain(
			"Runtime requestContext is the source of truth",
		);
		expect(instructionText).toContain(
			"149c3cc2-7f9e-49d0-950d-9a84aa3dd76c",
		);
		expect(instructionText).toContain(
			"44b92908-98cb-4e5e-a429-bccd63f8090f",
		);
		expect(instructionText).toContain("tenantId: 1");
	});
});
