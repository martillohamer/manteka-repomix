export interface HookConfig {
  id: string;
  name: string;
  enabled: boolean;
  mutationTypes: ('boolean' | 'operator' | 'constant')[];
  mutationRate: number; // 0.0 - 1.0
  qualityThreshold: number; // mutationScore mínimo para pasar
}

export interface MutationResult {
  originalCode: string;
  mutatedCode: string;
  mutationType: 'boolean' | 'operator' | 'constant';
  mutationIndex: number;
  reversible: boolean;
  applied: boolean;
}

export type QualityGateVerdict = 'passed' | 'blocked' | 'pending';

export interface QualityGateResult {
  verdict: QualityGateVerdict;
  mutationScore: number; // 0.0 - 1.0
  totalMutations: number;
  killedMutations: number;
  details: Array<{
    mutationIndex: number;
    mutationType: string;
    testResult: 'passed' | 'failed';
  }>;
}
