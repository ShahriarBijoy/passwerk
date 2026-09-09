/**
 * Derives the manifest that ships inside the .mcpb from the committed template. `version`,
 * `tools` and `prompts` are injected rather than committed so there is no second copy to
 * drift from the server package and its registry.
 */

/** Prompt descriptions shown in the Claude Desktop extension listing. */
const PROMPT_DESCRIPTIONS = {
  'build-passport-interview':
    'Interview the supplier for the data a battery passport needs, one attribute at a time.',
  'audit-supplier-submission':
    'Audit a set of supplier documents and report the gaps against Regulation (EU) 2023/1542.',
  'draft-data-request':
    'Draft a data request to the party that holds a missing attribute, in German or English.',
};

export function buildManifest(base, { version, tools, promptNames }) {
  const { manifest_version, name, display_name, ...rest } = base;
  return {
    manifest_version,
    name,
    display_name,
    version,
    ...rest,
    tools: tools.map((t) => ({ name: t.name, description: t.description })),
    tools_generated: false,
    prompts: promptNames.map((promptName) => ({
      name: promptName,
      description: PROMPT_DESCRIPTIONS[promptName] ?? promptName,
    })),
    prompts_generated: false,
  };
}
