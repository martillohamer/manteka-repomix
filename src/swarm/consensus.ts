/**
 * consensus.ts - Motor de votación heurística que pondera la confianza
 * y selecciona la propuesta ganadora entre los agentes.
 *
 * Restricciones: cero runtime deps, TypeScript estricto, rutas Windows-safe.
 */
import type { SwarmProposal } from './types.js';

/**
 * Ponderaciones por defecto por rol de agente
 */
const DEFAULT_WEIGHTS: Record<'typeAgent' | 'lintAgent' | 'smellAgent', number> = {
  typeAgent: 0.4,
  lintAgent: 0.35,
  smellAgent: 0.25,
};

/**
 * Evalúa y selecciona la mejor propuesta entre múltiples candidatos
 * usando un sistema de votación ponderado por confianza y expertise.
 * @param proposals - Array de propuestas de los agentes
 * @returns La propuesta seleccionada y el ranking de todas las propuestas
 */
export const selectBestProposal = (
  proposals: SwarmProposal[],
): {
  selected: SwarmProposal | null;
  ranking: Array<{ proposal: SwarmProposal; score: number }>;
} => {
  if (proposals.length === 0) {
    return { selected: null, ranking: [] };
  }

  // Calcular scores ponderados para cada propuesta
  const rankings = proposals.map((proposal) => {
    const baseWeight = DEFAULT_WEIGHTS[proposal.role] || 0.1;
    // Factores de Score:
    // 1. Confidence (0-1) - peso principal
    // 2. Role expertise weight
    // 3. Normalization factor (simplified)
    const confidenceScore = proposal.confidence;
    const weightedScore = confidenceScore * baseWeight;

    return {
      proposal,
      score: weightedScore,
    };
  });

  // Ordenar por score descendente
  rankings.sort((a, b) => b.score - a.score);

  // Seleccionar la mejor propuesta
  const selected = rankings[0].proposal;

  return {
    selected,
    ranking: rankings,
  };
};

/**
 * Filtra propuestas por umbral de confianza mínima
 * @param proposals - Array de propuestas
 * @param minConfidence - Umbral mínimo de confianza (0-1)
 * @returns Propuestas que superan el umbral
 */
export const filterByConfidence = (proposals: SwarmProposal[], minConfidence: number): SwarmProposal[] => {
  return proposals.filter((proposal) => proposal.confidence >= minConfidence);
};

/**
 * Agrupa propuestas por rol de agente
 * @param proposals - Array de propuestas
 * @returns Map role -> proposals
 */
export const groupByRole = (
  proposals: SwarmProposal[],
): Map<'typeAgent' | 'lintAgent' | 'smellAgent', SwarmProposal[]> => {
  const groups = new Map<'typeAgent' | 'lintAgent' | 'smellAgent', SwarmProposal[]>();
  for (const proposal of proposals) {
    if (!groups.has(proposal.role)) {
      groups.set(proposal.role, []);
    }
    groups.get(proposal.role)!.push(proposal);
  }
  return groups;
};

/**
 * Obtiene la mejor propuesta por rol específico
 * @param proposals - Array de propuestas
 * @param role - Role to filter by
 * @returns Best proposal for the role or null
 */
export const getBestByRole = (
  proposals: SwarmProposal[],
  role: 'typeAgent' | 'lintAgent' | 'smellAgent',
): SwarmProposal | null => {
  const roleProposals = proposals.filter((p) => p.role === role);
  if (roleProposals.length === 0) {
    return null;
  }
  return selectBestProposal(roleProposals).selected;
};
