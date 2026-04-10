import { describe, expect, test } from "bun:test";
import { SqlValidatorService } from "../../src/services/sql-validator.service";

describe("SqlValidatorService", () => {
	const validator = new SqlValidatorService();

	describe("validate()", () => {
		test("accepts read-only select with explicit columns", () => {
			expect(() =>
				validator.validate("select id, name from orders limit 10"),
			).not.toThrow();
		});

		test("rejects SELECT *", () => {
			expect(() =>
				validator.validate("select * from orders limit 10"),
			).toThrow("SELECT * is not allowed");
		});

		test("accepts CTE with select", () => {
			expect(() =>
				validator.validate(
					"with cte as (select * from (select id from orders)) select id from cte limit 10",
				),
			).not.toThrow();
		});

		test("rejects update statements", () => {
			expect(() => validator.validate("update orders set amount = 0")).toThrow(
				"Only read-only SELECT statements are allowed.",
			);
		});

		test("rejects insert statements", () => {
			expect(() =>
				validator.validate("insert into orders values (1, 2)"),
			).toThrow("Only read-only SELECT statements are allowed.");
		});

		test("rejects delete statements", () => {
			expect(() =>
				validator.validate("delete from orders where id = 1"),
			).toThrow("Only read-only SELECT statements are allowed.");
		});

		test("rejects drop statements", () => {
			expect(() => validator.validate("drop table orders")).toThrow(
				"Only read-only SELECT statements are allowed.",
			);
		});

		test("accepts trailing semicolons (harmless on single statements)", () => {
			expect(() =>
				validator.validate("select id, name from orders limit 10;"),
			).not.toThrow();
		});

		test("rejects semicolons in the middle (multi-statement)", () => {
			expect(() =>
				validator.validate("select id from orders limit 10; drop table users"),
			).toThrow("must not contain semicolons");
		});

		test("rejects queries not starting with select or with", () => {
			expect(() => validator.validate("show tables")).toThrow(
				"Query must start with SELECT or WITH",
			);
		});
	});

	describe("validationChain", () => {
		test("passes through valid SQL", async () => {
			const input = { sql: "SELECT id, name FROM users LIMIT 100", other: "data" };
			const result = await validator.validationChain.invoke(input);

			expect(result).toEqual(input);
		});

		test("passes through CTE queries", async () => {
			const input = {
				sql: "WITH cte AS (SELECT * FROM (SELECT id FROM users)) SELECT id FROM cte LIMIT 10",
				other: "data",
			};
			const result = await validator.validationChain.invoke(input);

			expect(result).toEqual(input);
		});

		test("throws error for invalid SQL", async () => {
			const input = { sql: "DROP TABLE users", other: "data" };

			await expect(validator.validationChain.invoke(input)).rejects.toThrow(
				"Only read-only SELECT statements are allowed",
			);
		});

		test("accepts trailing semicolons", async () => {
			const input = { sql: "SELECT id, name FROM users LIMIT 100;", other: "data" };
			const result = await validator.validationChain.invoke(input);

			expect(result).toEqual(input);
		});

		test("throws error for semicolons in middle (multi-statement)", async () => {
			const input = { sql: "SELECT id FROM users LIMIT 10; DROP TABLE users", other: "data" };

			await expect(validator.validationChain.invoke(input)).rejects.toThrow(
				"must not contain semicolons",
			);
		});

		test("preserves input data on success", async () => {
			const input = {
				sql: "SELECT id, name FROM users LIMIT 100",
				question: "Show users",
				context: [],
				params: [],
			};

			const result = await validator.validationChain.invoke(input);

			expect(result).toEqual(input);
			expect(result.question).toBe("Show users");
			expect(result.context).toEqual([]);
		});
	});
});
