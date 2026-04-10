import { describe, expect, test } from "bun:test";
import { SqlValidatorService } from "../../src/services/sql-validator.service";

describe("SqlValidatorService - Enhanced Security", () => {
	const validator = new SqlValidatorService();

	describe("SELECT * Prevention", () => {
		test("should reject SELECT * queries", () => {
			expect(() => {
				validator.validate("SELECT * FROM users");
			}).toThrow(/SELECT \* is not allowed/);
		});

		test("should reject SELECT * with WHERE clause", () => {
			expect(() => {
				validator.validate("SELECT * FROM orders WHERE status = 'active'");
			}).toThrow(/SELECT \* is not allowed/);
		});

		test("should allow explicit column selection", () => {
			expect(() => {
				validator.validate(
					"SELECT id, name, email FROM users WHERE active = true LIMIT 100",
				);
			}).not.toThrow();
		});

		test("should allow SELECT * in CTEs (subqueries)", () => {
			expect(() => {
				validator.validate(
					"WITH temp AS (SELECT * FROM (SELECT id FROM users)) SELECT id FROM temp LIMIT 10",
				);
			}).not.toThrow();
		});
	});

	describe("LIMIT Enforcement", () => {
		test("should reject queries without LIMIT", () => {
			expect(() => {
				validator.validate("SELECT id, name FROM users");
			}).toThrow(/must include a LIMIT clause/);
		});

		test("should allow queries with LIMIT", () => {
			expect(() => {
				validator.validate("SELECT id, name FROM users LIMIT 100");
			}).not.toThrow();
		});

		test("should reject LIMIT values over 10,000", () => {
			expect(() => {
				validator.validate("SELECT id, name FROM users LIMIT 50000");
			}).toThrow(/LIMIT 50000 is too high/);
		});

		test("should allow LIMIT 10000 (at boundary)", () => {
			expect(() => {
				validator.validate("SELECT id, name FROM users LIMIT 10000");
			}).not.toThrow();
		});

		test("should allow single-row aggregate without LIMIT (time range bounds resource usage)", () => {
			expect(() => {
				validator.validate(
					'SELECT SUM(amount) AS total FROM orders WHERE tenant_id = $1 AND created_at >= $2',
				);
			}).not.toThrow();
			expect(() => {
				validator.validate("SELECT COUNT(*) FROM users");
			}).not.toThrow();
		});

		test("should allow TOP clause (SQL Server)", () => {
			expect(() => {
				validator.validate("SELECT TOP 100 id, name FROM users");
			}).not.toThrow();
		});

		test("should reject TOP values over 10,000", () => {
			expect(() => {
				validator.validate("SELECT TOP 50000 id, name FROM users");
			}).toThrow(/TOP 50000 is too high/);
		});
	});

	describe("GROUP BY Column Limits", () => {
		test("should allow GROUP BY with 5 columns", () => {
			expect(() => {
				validator.validate(
					"SELECT col1, col2, col3, col4, col5, COUNT(*) FROM table GROUP BY col1, col2, col3, col4, col5 LIMIT 100",
				);
			}).not.toThrow();
		});

		test("should allow GROUP BY with 10 columns (at boundary)", () => {
			expect(() => {
				validator.validate(
					"SELECT col1, col2, col3, col4, col5, col6, col7, col8, col9, col10, COUNT(*) FROM table GROUP BY col1, col2, col3, col4, col5, col6, col7, col8, col9, col10 LIMIT 100",
				);
			}).not.toThrow();
		});

		test("should reject GROUP BY with more than 10 columns", () => {
			expect(() => {
				validator.validate(
					"SELECT col1, col2, col3, col4, col5, col6, col7, col8, col9, col10, col11, COUNT(*) FROM table GROUP BY col1, col2, col3, col4, col5, col6, col7, col8, col9, col10, col11 LIMIT 100",
				);
			}).toThrow(/GROUP BY with 11 columns/);
		});

		test("should handle GROUP BY with functions", () => {
			expect(() => {
				validator.validate(
					"SELECT DATE(created_at), status, COUNT(*) FROM orders GROUP BY DATE(created_at), status LIMIT 100",
				);
			}).not.toThrow();
		});

		test("should handle GROUP BY with COALESCE", () => {
			expect(() => {
				validator.validate(
					"SELECT COALESCE(region, 'Unknown'), status, COUNT(*) FROM orders GROUP BY COALESCE(region, 'Unknown'), status LIMIT 100",
				);
			}).not.toThrow();
		});
	});

	describe("Existing Security Checks", () => {
		test("should still reject multi-statement queries", () => {
			expect(() => {
				validator.validate("SELECT id FROM users; DROP TABLE users;");
			}).toThrow(/multi-statement/);
		});

		test("should still reject DML/DDL statements", () => {
			expect(() => {
				validator.validate("DELETE FROM users WHERE id = 1");
			}).toThrow(/Only read-only SELECT/);
		});

		test("should still require SELECT statement", () => {
			expect(() => {
				validator.validate("EXPLAIN SELECT id FROM users");
			}).toThrow(/must start with SELECT/);
		});
	});

	describe("Real-World Attack Scenarios", () => {
		test("should prevent 'show all columns' attack", () => {
			expect(() => {
				// Attacker tries to extract all data
				validator.validate("SELECT * FROM sensitive_data");
			}).toThrow(/SELECT \* is not allowed/);
		});

		test("should prevent high-cardinality GROUP BY attack", () => {
			expect(() => {
				// Attacker tries to create massive result set
				validator.validate(
					"SELECT col1, col2, col3, col4, col5, col6, col7, col8, col9, col10, col11, col12, COUNT(*) FROM users GROUP BY col1, col2, col3, col4, col5, col6, col7, col8, col9, col10, col11, col12 LIMIT 100",
				);
			}).toThrow(/GROUP BY with 12 columns/);
		});

		test("should prevent unlimited result extraction", () => {
			expect(() => {
				// Attacker tries to extract entire table
				validator.validate("SELECT id, email, password FROM users");
			}).toThrow(/must include a LIMIT clause/);
		});

		test("should prevent large LIMIT exploitation", () => {
			expect(() => {
				// Attacker tries to use huge LIMIT
				validator.validate(
					"SELECT id, email FROM users LIMIT 999999",
				);
			}).toThrow(/LIMIT 999999 is too high/);
		});
	});

	describe("Valid Analytics Queries", () => {
		test("should allow standard aggregation", () => {
			expect(() => {
				validator.validate(
					"SELECT status, COUNT(*) as count FROM orders GROUP BY status LIMIT 100",
				);
			}).not.toThrow();
		});

		test("should allow time-series analysis", () => {
			expect(() => {
				validator.validate(
					"SELECT DATE(created_at) as date, SUM(amount) as revenue FROM orders GROUP BY DATE(created_at) LIMIT 365",
				);
			}).not.toThrow();
		});

		test("should allow multi-dimensional analysis (reasonable)", () => {
			expect(() => {
				validator.validate(
					"SELECT region, product_category, status, COUNT(*) FROM orders GROUP BY region, product_category, status LIMIT 1000",
				);
			}).not.toThrow();
		});

		test("should allow CTEs with proper structure", () => {
			expect(() => {
				validator.validate(
					"WITH monthly_sales AS (SELECT DATE_TRUNC('month', created_at) as month, SUM(amount) as total FROM orders GROUP BY month) SELECT month, total FROM monthly_sales LIMIT 12",
				);
			}).not.toThrow();
		});
	});
});
