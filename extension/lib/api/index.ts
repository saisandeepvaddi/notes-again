import { createExistingRoutesApi } from "./existingRoutes";
import type { CaptureApi } from "./types";

export interface CaptureApiConfig {
  baseUrl: string;
  /** Personal API token; empty when the server has auth disabled. */
  token: string;
}

/**
 * THE swap point. When a purpose-built import endpoint lands on the backend,
 * implement CaptureApi against it in a sibling file and return that here;
 * nothing else in the extension needs to change.
 */
export function createCaptureApi(config: CaptureApiConfig): CaptureApi {
  return createExistingRoutesApi(config);
}
