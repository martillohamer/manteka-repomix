/**
 * adaptiveEngine.ts - Motor que re-pondera la confianza de parches
 * basándose en el historial del LineageStore y similitud de coseno.
 *
 * Restricciones: cero runtime deps, TypeScript estricto, rutas Windows-safe.
 */

import type { SwarmProposal } from '../swarm/types.js';
import { cosineSimilarity, tokenize } from './vectorizer.js';

/**
 * Factores de re-ponderación de confianza.
 * - baseFactor: Factor base cuando no hay historial similar
 * - highSimilarityBoost: Multiplicador cuando se encuentra alta similitud (> 0.7)
 * - mediumSimilarityBoost: Multiplicador cuando hay similitud moderada (0.5 - 0.7)
 */
const CONFIDENCE_FACTORS = {
  baseFactor: 0.9,
  highSimilarityBoost: 1.15,
  mediumSimilarityBoost: 1.05,
};

/**
 * Evalua la similitud entre un proposal y los registros del store.
 * @param proposal - Propuesta del agente con patch y descripción
 * @param lineageStore - Store de historial de linaje
 * @returns Factor de re-ponderación (0.8 - 1.2 range)
 */
export const evaluateProposalConfidence = (
  proposal: SwarmProposal,
  lineageStore: import('./lineageStore.js').LineageStore,
): number => {
  // Extraer texto relevante del proposal para búsqueda
  const proposalText = [
    proposal.patch?.file ?? '',
    proposal.rationale ?? '',
    JSON.stringify(proposal.patch?.diff ?? ''),
  ]
    .filter((t) => t && t.length > 0)
    .join(' ');

  // Si no hay store o texto, retornar factor base
  if (!proposalText.trim()) {
    return CONFIDENCE_FACTORS.baseFactor;
  }

  // Buscar registros similares en el lineage store
  const similarRecords = lineageStore.findSimilar(proposalText, 0.3);

  if (similarRecords.length === 0) {
    // No hay historial similar, aplicar factor base con ligera reducción
    return CONFIDENCE_FACTORS.baseFactor;
  }

  // Calcular la similitud máxima encontrada
  const maxSimilarity = similarRecords.reduce<number>(
    (max, record) => Math.max(max, (record.metadata?.similarity ?? 0) as number),
    0,
  );

  // Aplicar factor de re-ponderación basado en la similitud máxima
  if (maxSimilarity >= 0.7) {
    // Alta similitud: aumentar confianza un 15%
    return CONFIDENCE_FACTORS.highSimilarityBoost;
  } else if (maxSimilarity >= 0.5) {
    // similitud moderada: aumento pequeño del 5%
    return CONFIDENCE_FACTORS.mediumSimilarityBoost;
  } else {
    // Baja similitud: reducir confianza ligeramente
    return CONFIDENCE_FACTORS.baseFactor * 0.95;
  }
};

/**
 * Re-ponde la confianza de múltiples propuestas usando el LineageStore.
 * @param proposals - Array de propuestas del enjambre
 * @param lineageStore - Store de historial de linaje
 * @returns Propuestas con confianza re-ponderada
 */
export const adjustProposalsConfidence = (
  proposals: SwarmProposal[],
  lineageStore: import('./lineageStore.js').LineageStore,
): SwarmProposal[] => {
  return proposals.map((proposal) => {
    const newConfidence = evaluateProposalConfidence(proposal, lineageStore);

    // Asegurar que la confianza se mantenga en [0, 1]
    const clampedConfidence = Math.max(0, Math.min(1, newConfidence));

    return {
      ...proposal,
      confidence: clampedConfidence,
    };
  });
};

/**
 * Factory function para crear un evaluador de confianza adaptativa
 * @returns Objeto con métodos de evaluación y ajuste
 */
export const createAdaptiveEngine = () => {
  return {
    evaluateProposalConfidence,
    adjustProposalsConfidence,
  };
};
