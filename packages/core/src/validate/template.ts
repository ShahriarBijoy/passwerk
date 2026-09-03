import { type CatalogueElement, type CatalogueTemplate, templates } from '@passwerk/rules';
import type { Finding } from './finding.js';
import { message } from './messages.js';

const DROPIN_USE = 'https://admin-shell.io/smt-dropin/smt-dropin-use/1/0';

/** Loose view of an AAS JSON submodel element; L2 has already checked the real structure. */
interface JsonElement {
  idShort?: string | null;
  modelType?: string;
  semanticId?: { keys?: { value?: string }[] } | null;
  valueType?: string;
  typeValueListElement?: string;
  valueTypeListElement?: string;
  value?: unknown;
}
interface JsonSubmodel extends JsonElement {
  submodelElements?: JsonElement[] | null;
}

function firstKey(ref: JsonElement['semanticId']): string | null {
  return ref?.keys?.[0]?.value ?? null;
}

function children(el: JsonElement): JsonElement[] {
  return Array.isArray(el.value) ? (el.value as JsonElement[]) : [];
}

function templateChildren(
  t: CatalogueTemplate,
  parentPath: string,
  parentDepth: number,
): CatalogueElement[] {
  const prefix = `${parentPath}/`;
  return t.elements.filter((e) => e.depth === parentDepth + 1 && e.path.startsWith(prefix));
}

function finding(
  ruleId: string,
  severity: Finding['severity'],
  path: string,
  templatePath: string | undefined,
  detail: string,
): Finding {
  const f: Finding = { layer: 'L3', ruleId, severity, path, message: message(ruleId, detail) };
  if (templatePath) f.templatePath = templatePath;
  return f;
}

function matchesTemplate(inst: JsonElement, te: CatalogueElement, inList: boolean): boolean {
  if (!inList) return inst.idShort === te.idShort;
  return te.semanticId
    ? firstKey(inst.semanticId) === te.semanticId
    : inst.modelType === te.modelType;
}

function checkElement(
  t: CatalogueTemplate,
  te: CatalogueElement,
  inst: JsonElement,
  here: string,
  findings: Finding[],
): void {
  if (inst.modelType !== te.modelType) {
    findings.push(
      finding(
        'PW-L3-MODEL-TYPE',
        'error',
        here,
        te.path,
        `expected ${te.modelType}, got ${inst.modelType}`,
      ),
    );
    return;
  }
  if (te.semanticId && firstKey(inst.semanticId) !== te.semanticId) {
    findings.push(
      finding(
        'PW-L3-SEMANTIC-ID',
        'error',
        here,
        te.path,
        `expected ${te.semanticId}, got ${firstKey(inst.semanticId) ?? 'none'}`,
      ),
    );
  }
  if (te.modelType === 'Property' && te.valueType && inst.valueType !== te.valueType) {
    findings.push(
      finding(
        'PW-L3-VALUE-TYPE',
        'error',
        here,
        te.path,
        `expected ${te.valueType}, got ${inst.valueType ?? 'none'}`,
      ),
    );
  }
  if (te.modelType === 'SubmodelElementList' && te.listElement) {
    const le = te.listElement;
    const typeMismatch =
      le.typeValueListElement !== null && inst.typeValueListElement !== le.typeValueListElement;
    const valueTypeMismatch =
      le.valueTypeListElement !== null && inst.valueTypeListElement !== le.valueTypeListElement;
    if (typeMismatch || valueTypeMismatch) {
      findings.push(
        finding(
          'PW-L3-LIST-TYPE',
          'error',
          here,
          te.path,
          `expected ${le.typeValueListElement}/${le.valueTypeListElement ?? '-'}, got ${inst.typeValueListElement ?? '-'}/${inst.valueTypeListElement ?? '-'}`,
        ),
      );
    }
  }
  const isDropIn = te.supplementalSemanticIds.includes(DROPIN_USE);
  const isContainer =
    te.modelType === 'SubmodelElementCollection' || te.modelType === 'SubmodelElementList';
  if (isContainer && !isDropIn) {
    checkLevel(t, te, te.path, te.depth, here, children(inst), findings);
  }
}

function checkLevel(
  t: CatalogueTemplate,
  parent: CatalogueElement | null,
  parentPath: string,
  parentDepth: number,
  instancePath: string,
  instances: JsonElement[],
  findings: Finding[],
): void {
  const inList = parent?.modelType === 'SubmodelElementList';
  const matched = new Set<JsonElement>();

  for (const te of templateChildren(t, parentPath, parentDepth)) {
    const matches = instances.filter(
      (inst) => !matched.has(inst) && matchesTemplate(inst, te, inList),
    );
    for (const m of matches) matched.add(m);

    const min = te.cardinality.min ?? 0;
    const max = te.cardinality.max;
    const label = `${te.path} (${te.cardinality.raw ?? 'ZeroToMany'})`;
    if (matches.length < min) {
      findings.push(finding('PW-L3-MISSING', 'error', instancePath, te.path, label));
    }
    // Item templates inside a SubmodelElementList carry inconsistent cardinalities across the
    // IDTA templates ("One" for 3/.../LifeCyclePhase, "OneToMany" for 1/Markings/Markings__00__),
    // so the upper bound is only enforced outside lists. The list's own cardinality still applies.
    if (max !== null && !inList && matches.length > max) {
      findings.push(
        finding('PW-L3-TOO-MANY', 'error', instancePath, te.path, `${label}: ${matches.length}`),
      );
    }

    matches.forEach((inst, index) => {
      const here = inList
        ? `${instancePath}[${index}]`
        : `${instancePath}/${inst.idShort ?? te.idShort ?? '?'}`;
      checkElement(t, te, inst, here, findings);
    });
  }

  for (const inst of instances) {
    if (matched.has(inst)) continue;
    const label = inst.idShort ?? firstKey(inst.semanticId) ?? inst.modelType ?? '?';
    findings.push(
      finding('PW-L3-UNKNOWN-ELEMENT', 'warning', `${instancePath}/${label}`, parent?.path, label),
    );
  }
}

/** L3: every submodel in the environment conforms to its IDTA 02035 template. */
export function validateTemplate(jsonable: unknown): { findings: Finding[] } {
  const findings: Finding[] = [];
  const env = jsonable as { submodels?: JsonSubmodel[] | null };
  for (const sm of env.submodels ?? []) {
    const semanticId = firstKey(sm.semanticId);
    const template = templates.find((t) => t.submodelSemanticId === semanticId);
    const smPath = sm.idShort ?? semanticId ?? 'submodel';
    if (!template) {
      findings.push(
        finding('PW-L3-UNKNOWN-SUBMODEL', 'error', smPath, undefined, semanticId ?? 'none'),
      );
      continue;
    }
    if (sm.idShort !== template.submodelIdShort) {
      findings.push(
        finding(
          'PW-L3-SUBMODEL-ID-SHORT',
          'warning',
          smPath,
          undefined,
          `expected ${template.submodelIdShort}, got ${sm.idShort ?? 'none'}`,
        ),
      );
    }
    // Root elements have depth 0 and paths "<part>/<idShort>".
    checkLevel(
      template.catalogue,
      null,
      String(template.part),
      -1,
      template.submodelIdShort,
      sm.submodelElements ?? [],
      findings,
    );
  }
  return { findings };
}
