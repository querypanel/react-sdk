import { createContext } from "react";

/** True when the Assistant panel itself (not the viewport) is narrow, e.g. the Workspace rail or drawer. */
export const NarrowLayoutContext = createContext(false);
