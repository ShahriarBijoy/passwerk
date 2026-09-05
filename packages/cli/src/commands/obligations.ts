import { parseLang, pick, printJson, withOutputOptions } from '../format.js';
import { type InvokeResult, invoke, toolContext } from '../invoke.js';
import { EXIT_USAGE, type Lang } from '../io.js';
import { registerCommand } from '../program.js';

interface Options {
  type?: string;
  role?: string;
  energyKwh?: string;
  placedOnMarket?: string;
  asOf?: string;
  lang: string;
  json?: boolean;
}

const EXIT: Record<string, number> = { required: 0, not_required: 1, insufficient_input: 2 };

function lines(r: InvokeResult, lang: Lang): string[] {
  const s = r.structured as {
    mandatoryAttributes?: string[];
    conditionalAttributes?: string[];
    sources?: string[];
  };
  const out = [pick(r.text, lang)];
  if (s.mandatoryAttributes?.length) {
    out.push(
      `${lang === 'de' ? 'Pflichtattribute' : 'Mandatory attributes'}: ${s.mandatoryAttributes.join(', ')}`,
    );
  }
  if (s.conditionalAttributes?.length) {
    out.push(
      `${lang === 'de' ? 'Bedingte Attribute' : 'Conditional attributes'}: ${s.conditionalAttributes.join(', ')}`,
    );
  }
  if (s.sources?.length)
    out.push(`${lang === 'de' ? 'Quellen' : 'Sources'}: ${s.sources.join('; ')}`);
  return out;
}

registerCommand((program, io, exit) => {
  withOutputOptions(
    program
      .command('obligations')
      .description(
        'is a battery passport required? (exit 0 required, 1 not required, 2 insufficient input)',
      )
      .requiredOption('--type <batteryType>', 'EV, LMT, INDUSTRIAL, ... as placed on the market')
      .requiredOption('--role <role>', 'manufacturer, importer, distributor, ...')
      .option('--energy-kwh <decimal>', 'battery energy in kWh (industrial 2 kWh threshold)')
      .option('--placed-on-market <date>', 'ISO date placed on the market or put into service')
      .option('--as-of <date>', 'ISO date treated as "now" (default: the clock)'),
  ).action(async (options: Options) => {
    const lang = parseLang(options.lang);
    const r = await invoke(
      'check_obligations',
      {
        batteryType: options.type,
        role: options.role,
        ...(options.energyKwh !== undefined ? { energyKwh: options.energyKwh } : {}),
        ...(options.placedOnMarket !== undefined
          ? { placedOnMarketDate: options.placedOnMarket }
          : {}),
        asOf: options.asOf ?? io.clock,
      },
      toolContext(io),
    );
    if (r.isError) {
      io.stderr.write(`${String(r.structured['error'])}\n`);
      exit(EXIT_USAGE);
      return;
    }
    if (options.json) printJson(io, r.structured);
    else io.stdout.write(`${lines(r, lang).join('\n')}\n`);
    exit(EXIT[String(r.structured['verdict'])] ?? EXIT_USAGE);
  });
});
