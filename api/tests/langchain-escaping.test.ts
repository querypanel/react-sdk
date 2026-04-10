import { describe, expect, test } from "bun:test";
import { ChatPromptTemplate } from "@langchain/core/prompts";

describe("LangChain template escaping behavior", () => {
	test("double braces in template definition become single braces", async () => {
		const template = ChatPromptTemplate.fromMessages([
			["human", "Use {{name:Type}} style placeholders"],
		]);

		const formatted = await template.format({});
		console.log("Template definition with {{name:Type}}:", formatted);

		// Double braces in template definition should become single braces
		expect(formatted).toContain("{name:Type}");
		expect(formatted).not.toContain("{{name:Type}}");
	});

	test("double braces in substituted value stay as double braces", async () => {
		const template = ChatPromptTemplate.fromMessages([
			["human", "Dialect: {dialect}"],
		]);

		const formatted = await template.format({
			dialect: "Use {{name:Type}} style placeholders",
		});
		console.log("Substituted value with {{name:Type}}:", formatted);

		// This is the key question: does {{ in a substituted value get escaped?
		// If this test passes, substituted values are NOT processed for escaping
		expect(formatted).toContain("{{name:Type}}");
	});

	test("single braces in substituted value are treated as literals (not variables)", async () => {
		const template = ChatPromptTemplate.fromMessages([
			["human", "Dialect: {dialect}"],
		]);

		// This should NOT throw an error about missing 'name' variable
		// because the template is already parsed and {name:Type} is in a substituted value
		const formatted = await template.format({
			dialect: "Use {name:Type} style placeholders",
		});
		console.log("Substituted value with {name:Type}:", formatted);

		// Single braces in substituted values should be preserved as-is
		expect(formatted).toContain("{name:Type}");
	});

	test("verify what the LLM actually sees for ClickHouse instructions (FIXED)", async () => {
		// FIXED: Now using single braces which pass through correctly to the LLM
		const DIALECT_INSTRUCTIONS = `Use ClickHouse SQL syntax.
- Use {name:Type} style placeholders (single braces) where 'name' MUST match the param name exactly.
- Example: SELECT * FROM db.users WHERE status = {status:String} LIMIT 100`;

		const template = ChatPromptTemplate.fromMessages([
			[
				"human",
				[
					"Question: {question}",
					"Dialect: {dialect}",
					"Example in template: params: [{{name: 'start_date'}}]",
				].join("\n"),
			],
		]);

		const formatted = await template.format({
			question: "Get users",
			dialect: DIALECT_INSTRUCTIONS,
		});

		console.log("Full formatted prompt (FIXED):\n", formatted);

		// The "Example in template" line has {{ in the template definition -> becomes {
		expect(formatted).toContain("params: [{name: 'start_date'}]");

		// FIXED: Single braces in substituted values pass through as-is
		// LLM now sees {name:Type} and will generate SQL with single braces
		expect(formatted).toContain("{name:Type}");
		expect(formatted).toContain("{status:String}");
		// Verify NO double braces are present
		expect(formatted).not.toContain("{{name:Type}}");
		expect(formatted).not.toContain("{{status:String}}");
	});
});
