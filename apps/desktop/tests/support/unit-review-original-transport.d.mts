export const syntheticOriginalError: string;
export function installOriginalTransport(batchId: string): Promise<void>;
export function originalTransportState(): Promise<{
  calls: number;
  pending: number;
}>;
export function waitOriginalRequest(calls: number): Promise<void>;
export function releaseOriginalRequest(
  outcome: "real" | "failure",
): Promise<void>;
export function restoreOriginalTransport(): Promise<void>;
