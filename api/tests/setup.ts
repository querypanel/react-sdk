/**
 * Global test setup file
 * This file is preloaded by Bun before running any tests (see bunfig.toml)
 *
 * It ensures all required environment variables are set before any
 * config or service modules are imported, preventing configuration
 * errors in CI environments.
 */

import { setupTestEnv } from "./helpers/config.helper";
import { afterEach, mock } from "bun:test";

// Set up test environment variables before any other imports
setupTestEnv();

// Prevent module-mock leakage across test files.
afterEach(() => {
	mock.restore();
});

// Lock config module before any test-level mock.module attempts.
// This ensures strict config validation and consistent config shape across the suite.
await import("../src/config");

console.log("✓ Test environment configured");
