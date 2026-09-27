import { createExistingRoutesApi } from "./existingRoutes";
import type { CaptureApi } from "./types";

export interface CaptureApiConfig {
  baseUrl: string;
  token: string;
}

export function createCaptureApi(config: CaptureApiConfig): CaptureApi {
  return createExistingRoutesApi(config);
}
