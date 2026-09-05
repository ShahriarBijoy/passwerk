/** Importing a command module registers it; the order here is the order in `--help`. */
import './audit.js';
import './emit.js';
import './gaps.js';
import './obligations.js';
import './tools.js';
import { registerCommand } from '../program.js';

const PENDING = ['extract', 'chat'] as const;

for (const name of PENDING) {
  registerCommand((program) => {
    program.command(name).description(`${name} (not implemented yet)`);
  });
}
