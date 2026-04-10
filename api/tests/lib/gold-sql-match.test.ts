import { describe, expect, test } from "bun:test";
import {
	isExactOrNearGoldSqlMatch,
	normalizeForGoldSqlMatch,
} from "../../src/lib/gold-sql-match";

describe("gold-sql-match", () => {
	test("normalizes punctuation and casing", () => {
		expect(normalizeForGoldSqlMatch("Revenue, By Day!")).toBe("revenue by day");
	});

	test("matches exact same labels", () => {
		expect(
			isExactOrNearGoldSqlMatch("Monthly Revenue By Country", "monthly revenue by country"),
		).toBe(true);
	});

	test("does not treat short generic containment as exact", () => {
		expect(
			isExactOrNearGoldSqlMatch("orders", "orders by month"),
		).toBe(false);
	});

	test("matches strong token overlap for multi-word names", () => {
		expect(
			isExactOrNearGoldSqlMatch("show monthly revenue by country", "country monthly revenue"),
		).toBe(true);
	});

	test("rejects clearly different topics", () => {
		expect(
			isExactOrNearGoldSqlMatch("failed payments last week", "new users by region"),
		).toBe(false);
	});
});
