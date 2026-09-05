/** Importing a command module registers it; the order here is the order in `--help`. */
import { registerCommand } from '../program.js';

const NAMES = ['audit', 'extract', 'emit', 'gaps', 'obligations', 'tools', 'chat'] as const;

for (const name of NAMES) {
  registerCommand((program) => {
    program.command(name).description(`${name} (not implemented yet)`);
  });
}
