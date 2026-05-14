/**
 * X-Trace-Id helper — the fleet-wide correlation rule.
 *
 * Every inbound request reads `X-Trace-Id` from the headers if present
 * (and well-formed), otherwise mints a new one. Outbound integration
 * calls forward the same trace id. Audit rows store it.
 *
 * Format: `tr_` + 24 hex chars (~96 bits of entropy).
 */
import { randomBytes } from 'node:crypto';

const TRACE_RE = /^tr_[a-f0-9]{16,64}$/i;

export const TRACE_HEADER = 'x-trace-id';

export function mintTraceId(): string {
  return `tr_${randomBytes(12).toString('hex')}`;
}

export function readOrMintTraceId(req: Request): string {
  const incoming = req.headers.get(TRACE_HEADER);
  if (incoming && TRACE_RE.test(incoming)) return incoming;
  return mintTraceId();
}
