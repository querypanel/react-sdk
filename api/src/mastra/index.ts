import { Mastra } from "@mastra/core/mastra";
import { LangfuseExporter } from '@mastra/langfuse';
import { PinoLogger } from "@mastra/loggers";
import { Observability, SensitiveDataFilter } from "@mastra/observability";
import { PostgresStore } from "@mastra/pg";
import { config } from "../config";
import { sqlAgent } from "./agents/sql-agent";

export const mastra = new Mastra({
  agents: { sqlAgent },
  storage: new PostgresStore({
    id: "mastra-storage",
    connectionString: config.mastra.databaseUrl,
    max: config.mastra.postgresPoolMax,
    idleTimeoutMillis: config.mastra.postgresIdleTimeoutMillis,
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "querypanel-mastra",
        exporters: [
          new LangfuseExporter({
            publicKey: config.langfuse.publicKey,
            secretKey: config.langfuse.secretKey,
            baseUrl: config.langfuse.host,
          }),
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
