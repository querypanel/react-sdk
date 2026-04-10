import { describe, expect, test } from "bun:test";
import { QueryComplexityService } from "../../src/services/query-complexity.service";

describe("QueryComplexityService", () => {
	const service = new QueryComplexityService();

	describe("SELECT * Detection", () => {
		test("should detect SELECT *", () => {
			const analysis = service.analyze("SELECT * FROM users LIMIT 100");
			expect(analysis.hasSelectStar).toBe(true);
			expect(analysis.warnings.length).toBeGreaterThan(0);
		});

		test("should not flag explicit column selection", () => {
			const analysis = service.analyze(
				"SELECT id, name, email FROM users LIMIT 100",
			);
			expect(analysis.hasSelectStar).toBe(false);
		});
	});

	describe("Column Count Estimation", () => {
		test("should estimate column count accurately", () => {
			const analysis = service.analyze(
				"SELECT id, name, email, status, created_at FROM users LIMIT 100",
			);
			expect(analysis.columnCount).toBe(5);
		});

		test("should handle functions in SELECT", () => {
			const analysis = service.analyze(
				"SELECT COUNT(*), SUM(amount), AVG(price) FROM orders LIMIT 100",
			);
			expect(analysis.columnCount).toBe(3);
		});

		test("should handle nested functions", () => {
			const analysis = service.analyze(
				"SELECT COALESCE(name, 'Unknown'), DATE(created_at), COUNT(*) FROM users GROUP BY COALESCE(name, 'Unknown'), DATE(created_at) LIMIT 100",
			);
			expect(analysis.columnCount).toBe(3);
		});

		test("should warn on high column count", () => {
			const sql =
				"SELECT col1, col2, col3, col4, col5, col6, col7, col8, col9, col10, col11, col12 FROM table LIMIT 100";
			const analysis = service.analyze(sql);
			expect(analysis.columnCount).toBe(12);
			expect(analysis.warnings.some((w) => w.includes("12 columns"))).toBe(
				true,
			);
		});
	});

	describe("LIMIT Detection", () => {
		test("should detect missing LIMIT", () => {
			const analysis = service.analyze("SELECT id, name FROM users");
			expect(analysis.hasLimit).toBe(false);
			expect(analysis.riskLevel).toBe("critical");
		});

		test("should detect LIMIT clause", () => {
			const analysis = service.analyze("SELECT id, name FROM users LIMIT 100");
			expect(analysis.hasLimit).toBe(true);
			expect(analysis.limitValue).toBe(100);
		});

		test("should warn on high LIMIT values", () => {
			const analysis = service.analyze(
				"SELECT id, name FROM users LIMIT 5000",
			);
			expect(analysis.limitValue).toBe(5000);
			expect(analysis.warnings.some((w) => w.includes("5000"))).toBe(true);
		});
	});

	describe("GROUP BY Analysis", () => {
		test("should count GROUP BY columns", () => {
			const analysis = service.analyze(
				"SELECT region, status, COUNT(*) FROM orders GROUP BY region, status LIMIT 100",
			);
			expect(analysis.groupByColumnCount).toBe(2);
		});

		test("should warn on high GROUP BY column count", () => {
			const sql =
				"SELECT col1, col2, col3, col4, col5, col6, COUNT(*) FROM table GROUP BY col1, col2, col3, col4, col5, col6 LIMIT 100";
			const analysis = service.analyze(sql);
			expect(analysis.groupByColumnCount).toBe(6);
			expect(
				analysis.warnings.some((w) => w.includes("high cardinality")),
			).toBe(true);
		});

		test("should flag excessive GROUP BY columns", () => {
			const sql =
				"SELECT col1, col2, col3, col4, col5, col6, col7, col8, COUNT(*) FROM table GROUP BY col1, col2, col3, col4, col5, col6, col7, col8 LIMIT 100";
			const analysis = service.analyze(sql);
			expect(analysis.groupByColumnCount).toBe(8);
			expect(
				analysis.warnings.some((w) => w.includes("excessive cardinality")),
			).toBe(true);
			expect(analysis.riskLevel).toBe("critical");
		});

		test("should handle GROUP BY with functions", () => {
			const sql =
				"SELECT DATE(created_at), status, COUNT(*) FROM orders GROUP BY DATE(created_at), status LIMIT 100";
			const analysis = service.analyze(sql);
			expect(analysis.groupByColumnCount).toBe(2);
		});
	});

	describe("Risk Level Assessment", () => {
		test("should classify simple query as low risk", () => {
			const analysis = service.analyze(
				"SELECT id, name FROM users WHERE status = 'active' LIMIT 100",
			);
			expect(analysis.riskLevel).toBe("low");
		});

		test("should classify missing LIMIT as critical", () => {
			const analysis = service.analyze("SELECT id, name FROM users");
			expect(analysis.riskLevel).toBe("critical");
		});

		test("should classify high column count as medium/high", () => {
			const sql =
				"SELECT col1, col2, col3, col4, col5, col6, col7, col8, col9, col10, col11 FROM table LIMIT 100";
			const analysis = service.analyze(sql);
			expect(["medium", "high"]).toContain(analysis.riskLevel);
		});

		test("should classify excessive GROUP BY as critical", () => {
			const sql =
				"SELECT col1, col2, col3, col4, col5, col6, col7, col8, COUNT(*) FROM table GROUP BY col1, col2, col3, col4, col5, col6, col7, col8 LIMIT 100";
			const analysis = service.analyze(sql);
			expect(analysis.riskLevel).toBe("critical");
		});
	});

	describe("Real-World Scenarios", () => {
		test("should analyze typical dashboard query", () => {
			const sql =
				"SELECT DATE(created_at) as date, status, COUNT(*) as count, SUM(amount) as total FROM orders WHERE created_at >= '2024-01-01' GROUP BY DATE(created_at), status LIMIT 1000";
			const analysis = service.analyze(sql);
			expect(analysis.riskLevel).toBe("low");
			expect(analysis.groupByColumnCount).toBe(2);
			expect(analysis.limitValue).toBe(1000);
		});

		test("should flag problematic extraction query", () => {
			const sql =
				"SELECT col1, col2, col3, col4, col5, col6, col7, col8, col9, col10 FROM sensitive_data GROUP BY col1, col2, col3, col4, col5, col6, col7, col8 LIMIT 10000";
			const analysis = service.analyze(sql);
			expect(analysis.riskLevel).toBe("critical");
			expect(analysis.warnings.length).toBeGreaterThan(0);
		});

		test("should allow reasonable multi-dimensional analysis", () => {
			const sql =
				"SELECT region, product_category, status, COUNT(*) as count FROM orders GROUP BY region, product_category, status LIMIT 500";
			const analysis = service.analyze(sql);
			expect(analysis.riskLevel).toBe("low");
			expect(analysis.groupByColumnCount).toBe(3);
		});
	});

	describe("Format Analysis", () => {
		test("should format analysis results", () => {
			const sql =
				"SELECT col1, col2, COUNT(*) FROM table GROUP BY col1, col2 LIMIT 100";
			const analysis = service.analyze(sql);
			const formatted = service.formatAnalysis(analysis);

			expect(formatted).toContain("Risk Level:");
			expect(formatted).toContain("Columns:");
			expect(formatted).toContain("GROUP BY columns:");
			expect(formatted).toContain("LIMIT:");
		});

		test("should include warnings in formatted output", () => {
			const sql =
				"SELECT col1, col2, col3, col4, col5, col6, COUNT(*) FROM table GROUP BY col1, col2, col3, col4, col5, col6 LIMIT 100";
			const analysis = service.analyze(sql);
			const formatted = service.formatAnalysis(analysis);

			expect(formatted).toContain("Warnings:");
			expect(formatted).toContain("high cardinality");
		});
	});

	describe("Edge Cases", () => {
		test("should handle CTE queries", () => {
			const sql =
				"WITH temp AS (SELECT id, name FROM users WHERE active = true) SELECT id, name FROM temp LIMIT 100";
			const analysis = service.analyze(sql);
			expect(analysis.hasLimit).toBe(true);
		});

		test("should handle queries with quoted identifiers", () => {
			const sql =
				'SELECT "user_id", "order_count" FROM "sales_summary" GROUP BY "user_id", "order_count" LIMIT 100';
			const analysis = service.analyze(sql);
			expect(analysis.groupByColumnCount).toBe(2);
		});

		test("should handle case-insensitive SQL", () => {
			const sql =
				"select id, name from users where status = 'active' limit 100";
			const analysis = service.analyze(sql);
			expect(analysis.hasLimit).toBe(true);
			expect(analysis.riskLevel).toBe("low");
		});
	});
});
