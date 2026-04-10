import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { AuthContext } from "./auth";

export type AppContext = {
	Bindings: HonoBindings;
	Variables: HonoVariables & {
		auth: AuthContext;
	};
};
