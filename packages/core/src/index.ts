/**
 * @passwerk/core — MCP-free library: ingest → extract → map → validate → gap → emit → carrier.
 *
 * Phase 0 placeholder. No product code yet.
 */
import { PACKAGE_NAME as RULES_PACKAGE } from '@passwerk/rules';

export const PACKAGE_NAME = '@passwerk/core' as const;
export const DEPENDS_ON = [RULES_PACKAGE] as const;
