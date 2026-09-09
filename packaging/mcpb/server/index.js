#!/usr/bin/env node
/**
 * The MCPB bundle's entry point. `dist/bin.js` self-executes only when it is process.argv[1],
 * which it is not here, so the launcher calls the exported `main`. `main` reads argv and env
 * itself. Keeping `bin.js` as the importer also keeps `new URL('../ui/workbench.html', ...)`
 * resolving to the workbench inside the installed server package (ADR D-037).
 */
import { main } from './node_modules/@passwerk/server/dist/bin.js';

process.exitCode = await main();
