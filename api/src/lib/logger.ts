import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";

export const logger = pino({
	level: process.env.LOG_LEVEL || "debug",
	transport: isDevelopment
		? {
				target: "pino-pretty",
				options: {
					colorize: true,
					translateTime: "HH:MM:ss",
					ignore: "pid,hostname",
				},
			}
		: undefined,
});

// Create child loggers for different parts of the application
export const createLogger = (name: string) => {
	return logger.child({ module: name });
};
