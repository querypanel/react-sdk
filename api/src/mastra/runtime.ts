import { ChartGeneratorService } from "../services/chart-generator.service";
import { DatasourceService } from "../services/datasource.service";
import { SessionService } from "../services/session.service";
import { SqlLogService } from "../services/sql-log.service";
import { VizSpecGeneratorService } from "../services/vizspec-generator.service";
import { QueryRunnerV2Service } from "../services/v2/query-runner-v2.service";
import { HybridRetrieverService } from "../services/v2/hybrid-retriever.service";
import { SchemaStorageService } from "../services/schema-storage.service";

const schemaStorageService = new SchemaStorageService();

const runtime = {
	schemaStorageService,
	hybridRetriever: new HybridRetrieverService(schemaStorageService),
	queryRunnerV2: new QueryRunnerV2Service(),
	datasourceService: new DatasourceService(),
	vizspecGenerator: new VizSpecGeneratorService(),
	chartGenerator: new ChartGeneratorService(),
	sessionService: new SessionService(),
	sqlLogService: new SqlLogService(),
};

export function getMastraRuntime() {
	return runtime;
}
