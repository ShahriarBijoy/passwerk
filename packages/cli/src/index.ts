/**
 * @passwerk/cli — the `passwerk` command-line interface.
 *
 * Phase 0 placeholder. No product code yet.
 */
import { PACKAGE_NAME as CORE_PACKAGE } from '@passwerk/core';

export const PACKAGE_NAME = '@passwerk/cli' as const;
export const DEPENDS_ON = [CORE_PACKAGE] as const;
