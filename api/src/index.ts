// IMPORTANT: Initialize instrumentation BEFORE any other imports
// This must be the very first thing that runs to ensure OpenTelemetry captures everything
import { initializeInstrumentation } from "./lib/instrumentation";

initializeInstrumentation();

import { createAppWithMastra } from "./app";

const app = await createAppWithMastra();

export default {
	fetch: app.fetch,
	idleTimeout: 30,
};
