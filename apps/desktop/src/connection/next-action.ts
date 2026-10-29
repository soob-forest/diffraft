import type { ConnectionStatus } from "../generated/ConnectionStatus";

export function connectionNextAction(
  status: ConnectionStatus | undefined,
  _tested: boolean,
  error: string,
) {
  if (error) return "inspect";
  if (status === "MISSING" || status === "UNSUPPORTED") return "install";
  if (status === "AUTH_REQUIRED" || status === "AUTH_ROUTE_MISMATCH")
    return "login";
  if (status === "READY") return "close";
  return "inspect";
}
