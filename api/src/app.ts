import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { pinoLogger } from "hono-pino";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middleware/auth.middleware";
import { responseTimeMiddleware } from "./middleware/response-time.middleware";
import { registerActiveChartRoutes } from "./routes/active-chart.route";
import { registerChartRoutes } from "./routes/chart.route";
import { registerDashboardRoutes } from "./routes/dashboard.route";
import { registerEmbedRoutes } from "./routes/embed.route";
import { registerIngestRoutes } from "./routes/ingest.route";
import { registerKnowledgeBaseRoutes } from "./routes/knowledge-base.route";
import { registerQueryRoutes } from "./routes/query.route";
import { registerQueryV2Routes } from "./routes/query-v2.route";
import { registerRewriteDatefilterRoutes } from "./routes/rewrite-datefilter.route";
import { registerSessionRoutes } from "./routes/session.route";
import { registerSavedChartRoutes } from "./routes/saved-chart.route";
import { registerVizSpecRoutes } from "./routes/vizspec.route";
import { ActiveChartService } from "./services/active-chart.service";
import { AutoEvalService } from "./services/auto-eval.service";
import { ChartGeneratorService } from "./services/chart-generator.service";
import { DashboardService } from "./services/dashboard.service";
import { DashboardForkService } from "./services/dashboard-fork.service";
import { VizSpecGeneratorService } from "./services/vizspec-generator.service";
import { ChunkerService } from "./services/chunker.service";
import { EmbeddingService } from "./services/embedding.service";
import { KnowledgeBaseService } from "./services/knowledge-base.service";
import { KnowledgeChunkService } from "./services/knowledge-chunk.service";
import { QueryRunnerService } from "./services/query-runner.service";
import { QueryRunnerV2Service } from "./services/v2/query-runner-v2.service";
import { DatasourceService } from "./services/datasource.service";
import { SavedChartService } from "./services/saved-chart.service";
import { SchemaStorageService } from "./services/schema-storage.service";
import { SessionService } from "./services/session.service";
import { SqlLogService } from "./services/sql-log.service";
import type { AppContext } from "./types/app";

type QueryPanelApp = Hono<AppContext>;
type MastraServerLike = {
	init(): Promise<void>;
};

type AppOptions = {
	authMiddleware?: MiddlewareHandler<AppContext>;
	createMastraServer?: (
		app: QueryPanelApp,
	) => MastraServerLike | Promise<MastraServerLike>;
};

function createBaseApp() {
	const app = new Hono<AppContext>();

	app.use("*", pinoLogger({ pino: logger }));
	app.use("*", responseTimeMiddleware());
	app.use(
		"*",
		cors({
			origin: "*",
			allowHeaders: [
				"Content-Type",
				"Authorization",
				"X-Organization-Id",
				"X-API-Key",
				"X-Session-ID",
			],
			allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			maxAge: 600,
		}),
	);

	app.get("/", (c) => {
		return c.json({
			message: "QueryPanel API v1",
			status: "ok",
			timestamp: new Date().toISOString(),
		});
	});

	app.get("/healthz", (c) => {
		return c.json({
			message: "OK",
			status: "healthy",
			timestamp: new Date().toISOString(),
		});
	});

	return app;
}

function registerApplicationRoutes(
	app: QueryPanelApp,
	options: AppOptions = {},
) {
	app.use("*", options.authMiddleware ?? authMiddleware());

	const chunkerService = new ChunkerService();
	const embeddingService = new EmbeddingService();
	const schemaStorageService = new SchemaStorageService();
	const knowledgeBaseService = new KnowledgeBaseService();
	const knowledgeChunkService = new KnowledgeChunkService();
	const queryRunner = new QueryRunnerService();
	const queryRunnerV2 = new QueryRunnerV2Service();
	const datasourceService = new DatasourceService();
	const chartGenerator = new ChartGeneratorService();
	const vizspecGenerator = new VizSpecGeneratorService();
	const sqlLogService = new SqlLogService();
	const autoEvalService = new AutoEvalService();
	const savedChartService = new SavedChartService();
	const activeChartService = new ActiveChartService();
	const sessionService = new SessionService();
	const dashboardService = new DashboardService();
	const dashboardForkService = new DashboardForkService();

	registerIngestRoutes(app, {
		chunkerService,
		embeddingService,
		schemaStorageService,
		knowledgeBaseService,
	});

	registerKnowledgeBaseRoutes(app, {
		knowledgeBaseService,
		embeddingService,
		knowledgeChunkService,
	});

	registerQueryRoutes(app, {
		queryRunner,
		sqlLogService,
		sessionService,
	});

	registerQueryV2Routes(app, {
		queryRunnerV2,
		sqlLogService,
		sessionService,
	});

	registerRewriteDatefilterRoutes(app, {
		queryRunnerV2,
		sqlLogService,
		sessionService,
	});

	registerChartRoutes(app, {
		chartGenerator,
		sqlLogService,
		autoEvalService,
	});

	registerVizSpecRoutes(app, {
		vizspecGenerator,
		sqlLogService,
		autoEvalService,
	});

	registerSavedChartRoutes(app, {
		savedChartService,
	});

	registerActiveChartRoutes(app, {
		activeChartService,
	});

	registerSessionRoutes(app, {
		sessionService,
	});

	registerDashboardRoutes(app, {
		dashboardService,
		dashboardForkService,
	});

	registerEmbedRoutes(app, {
		queryRunnerV2,
		vizspecGenerator,
		datasourceService,
		chartGenerator,
		sessionService,
		sqlLogService,
	});

	return app;
}

async function defaultCreateMastraServer(app: QueryPanelApp) {
	const [{ MastraServer }, { mastra }] = await Promise.all([
		import("@mastra/hono"),
		import("./mastra/index"),
	]);

	return new MastraServer({ app, mastra });
}

export function createApp(options: AppOptions = {}) {
	const app = createBaseApp();
	return registerApplicationRoutes(app, options);
}

export async function initializeMastra(
	app: QueryPanelApp,
	createMastraServer: AppOptions["createMastraServer"] = defaultCreateMastraServer,
) {
	const server = await createMastraServer(app);
	await server.init();
	return app;
}

export async function createAppWithMastra(options: AppOptions = {}) {
	const app = createBaseApp();
	app.use("/api/agents/*", options.authMiddleware ?? authMiddleware());
	await initializeMastra(app, options.createMastraServer);
	return registerApplicationRoutes(app, options);
}
