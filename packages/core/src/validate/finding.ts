export type Layer = 'L1' | 'L2' | 'L3';
export type Severity = 'error' | 'warning';
export type Verdict = 'valid' | 'valid_with_warnings' | 'invalid';

export interface Finding {
  layer: Layer;
  ruleId: string;
  severity: Severity;
  /** Draft path (L1) or AAS path (L2, L3) */
  path: string;
  /** Catalogue path when known, e.g. "6/BatteryMaterials/BatteryMaterial/BatteryMaterialIdentifier" */
  templatePath?: string;
  attributeId?: string;
  message: { de: string; en: string };
}

export interface LayerResult {
  ran: boolean;
  errors: number;
  warnings: number;
}

export interface ValidationReport {
  verdict: Verdict;
  findings: Finding[];
  layers: Record<Layer, LayerResult>;
}

export function computeVerdict(findings: readonly Finding[]): Verdict {
  if (findings.some((f) => f.severity === 'error')) return 'invalid';
  if (findings.some((f) => f.severity === 'warning')) return 'valid_with_warnings';
  return 'valid';
}

export function layerResult(findings: readonly Finding[], layer: Layer, ran: boolean): LayerResult {
  const mine = findings.filter((f) => f.layer === layer);
  return {
    ran,
    errors: mine.filter((f) => f.severity === 'error').length,
    warnings: mine.filter((f) => f.severity === 'warning').length,
  };
}

export function buildReport(findings: Finding[], ran: Record<Layer, boolean>): ValidationReport {
  return {
    verdict: computeVerdict(findings),
    findings,
    layers: {
      L1: layerResult(findings, 'L1', ran.L1),
      L2: layerResult(findings, 'L2', ran.L2),
      L3: layerResult(findings, 'L3', ran.L3),
    },
  };
}
