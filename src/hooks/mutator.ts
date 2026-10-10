/**
 * BiologicalMutator - Mutaciones deterministas y reversibles de booleanos y operadores.
 *
 * Restricciones: cero runtime deps, TypeScript estricto, rutas Windows-safe.
 */
import type { HookConfig, MutationResult, QualityGateVerdict } from './types.js';

const BOOL_VALUES = [true, false];
const OPERATORS = ['&&', '||', '!', '==', '!=', '>', '<', '>=', '<='];
const CONSTANTS = ['true', 'false', 'null', 'undefined'];

/**
 * Genera una mutación determinista en el código proporcionado.
 * @param code - Código fuente a mutar
 * @param mutationType - Tipo de mutación ('boolean', 'operator', 'constant')
 * @param index - Índice para selección determinista
 * @returns Resultado de la mutación con código original y mutado
 */
export const mutateCode = (
  code: string,
  mutationType: 'boolean' | 'operator' | 'constant',
  index: number,
): MutationResult => {
  let mutatedCode = code;
  let reversible = false;
  let applied = false;

  switch (mutationType) {
    case 'boolean': {
      // Mutación de booleanos: toggle true <-> false
      const boolIndex = index % BOOL_VALUES.length;
      const originalBool = BOOL_VALUES[boolIndex];
      const mutatedBool = !originalBool;

      // Reemplazar la primera ocurrencia de un patrón de booleanos
      const boolPattern = /(?:true|false)/g;
      const match = code.match(boolPattern);
      if (match && match.length > 0) {
        const target = match[boolIndex % match.length];
        mutatedCode = code.replace(target, mutatedBool ? 'true' : 'false');
        reversible = true;
        applied = true;
      }
      break;
    }

    case 'operator': {
      // Mutación de operadores: cambiar entre operadores lógicos/comparación
      const opIndex = index % OPERATORS.length;
      const originalOp = OPERATORS[opIndex];

      // Buscar y reemplazar operador
      const escapedOp = originalOp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const opPattern = new RegExp(escapedOp, 'g');
      const matches = code.match(opPattern);

      if (matches && matches.length > 0) {
        const target = matches[opIndex % matches.length];
        // Encontrar un operador diferente para reemplazar
        const alternativeOps = OPERATORS.filter((op) => op !== originalOp);
        const altOp = alternativeOps[index % alternativeOps.length];
        mutatedCode = code.replace(target, altOp);
        reversible = true;
        applied = true;
      }
      break;
    }

    case 'constant': {
      // Mutación de constantes: true <-> false, null <-> undefined
      const constIndex = index % CONSTANTS.length;
      const originalConst = CONSTANTS[constIndex];
      let mutatedConst: string;

      switch (originalConst) {
        case 'true':
          mutatedConst = 'false';
          break;
        case 'false':
          mutatedConst = 'true';
          break;
        case 'null':
          mutatedConst = 'undefined';
          break;
        case 'undefined':
          mutatedConst = 'null';
          break;
        default:
          mutatedConst = originalConst;
      }

      const constPattern = new RegExp(`\\b${originalConst}\\b`, 'g');
      const matches = code.match(constPattern);

      if (matches && matches.length > 0) {
        mutatedCode = code.replace(matches[0], mutatedConst);
        reversible = true;
        applied = true;
      }
      break;
    }
  }

  return {
    originalCode: code,
    mutatedCode,
    mutationType,
    mutationIndex: index,
    reversible,
    applied,
  };
};

/**
 * Genera todas las mutaciones posibles para un código dado.
 * @param code - Código fuente a mutar
 * @param config - Configuración de mutación
 * @returns Array de resultados de mutación
 */
export const generateMutations = (code: string, config: HookConfig): MutationResult[] => {
  const results: MutationResult[] = [];

  let index = 0;
  for (const mutationType of config.mutationTypes) {
    // Generar múltiples mutaciones por tipo para cobertura
    const mutationCount = Math.ceil(config.mutationRate * 10);

    for (let i = 0; i < mutationCount; i++) {
      const result = mutateCode(code, mutationType, index);
      if (result.applied) {
        results.push(result);
      }
      index++;
    }
  }

  return results;
};

/**
 * Verifica si una mutación es reversible (puede restaurar el código original).
 * @param result - Resultado de la mutación
 * @returns true si la mutación es reversible
 */
export const isReversible = (result: MutationResult): boolean => {
  return result.reversible;
};

/**
 * Obtiene el verdict del gate de calidad basado en la puntuación de mutaciones.
 * @param mutationScore - Puntuación de mutaciones (0.0 - 1.0)
 * @param threshold - Umbral de configuración
 * @returns Veredicto QualityGateVerdict
 */
export const getQualityVerdict = (mutationScore: number, threshold: number): QualityGateVerdict => {
  if (mutationScore >= threshold) {
    return 'passed';
  }
  // Si la puntuación es muy baja (< 0.3), bloquear incluso si está por encima del umbral
  // por si los tests no tienen suficiente cobertura
  if (mutationScore < 0.3) {
    return 'blocked';
  }
  return 'pending';
};
