import type { ExtractedCommercialValue } from '@mirror/contracts';
import { redactSecrets } from '@mirror/shared';

export interface PageObservationPayload {
  url: string;
  title: string;
  timestamp: string;
  viewport: { width: number; height: number };
  domSnapshot?: string;
  extractedCommercialValues: ExtractedCommercialValue[];
  networkRequests?: Array<{
    url: string;
    method: string;
    status: number;
    resourceType: string;
  }>;
}

export function sanitizeNetworkLog(requests: Array<{
  url: string;
  method: string;
  status: number;
  resourceType: string;
  headers?: Record<string, string>;
}>): Array<{ url: string; method: string; status: number; resourceType: string }> {
  return requests.map((req) => ({
    url: req.url,
    method: req.method,
    status: req.status,
    resourceType: req.resourceType
  }));
}

export function createObservationRecord(
  url: string,
  title: string,
  viewport: { width: number; height: number },
  extractedCommercialValues: ExtractedCommercialValue[],
  domSnapshot?: string
): PageObservationPayload {
  return {
    url,
    title,
    timestamp: new Date().toISOString(),
    viewport,
    domSnapshot,
    extractedCommercialValues: redactSecrets(extractedCommercialValues) as ExtractedCommercialValue[]
  };
}
