import type { MiddlewareHandler } from "hono";

type ResponseTimeOptions = {
	/**
	 * When enabled, adds `X-Response-Time` (e.g. `12.3ms`) to all responses.
	 * Defaults to true.
	 */
	includeXResponseTime?: boolean;
	/**
	 * When enabled, appends a `Server-Timing` metric named `app` (duration in ms).
	 * Defaults to true.
	 */
	includeServerTiming?: boolean;
	/**
	 * Metric name for Server-Timing. Defaults to `app`.
	 */
	serverTimingName?: string;
};

function nowMs() {
	// `performance.now()` is monotonic and ideal for latency measurement.
	// In older runtimes it may not exist, so fall back to Date.
	return typeof performance !== "undefined" && typeof performance.now === "function"
		? performance.now()
		: Date.now();
}

function formatMs(ms: number) {
	// Keep it compact but deterministic for tests/logging.
	return Number.isFinite(ms) ? ms.toFixed(1) : "0.0";
}

export function responseTimeMiddleware(
	options: ResponseTimeOptions = {},
): MiddlewareHandler {
	const {
		includeXResponseTime = true,
		includeServerTiming = true,
		serverTimingName = "app",
	} = options;

	return async (c, next) => {
		const start = nowMs();
		try {
			await next();
		} finally {
			const durationMs = Math.max(0, nowMs() - start);
			const durationStr = formatMs(durationMs);

			if (includeXResponseTime) {
				c.res.headers.set("X-Response-Time", `${durationStr}ms`);
			}

			if (includeServerTiming) {
				const existing = c.res.headers.get("Server-Timing");
				const metric = `${serverTimingName};dur=${durationStr}`;
				c.res.headers.set(
					"Server-Timing",
					existing ? `${existing}, ${metric}` : metric,
				);
			}
		}
	};
}

