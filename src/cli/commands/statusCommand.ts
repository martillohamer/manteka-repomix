import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import type { Command } from 'commander';
import pc from 'picocolors';
import { computeOperatorWeights, type Lineage, loadLineage } from '../../biomimicry/lineageStore.js';
import { LAWS_FILE_NAME, parseLawsManifest } from '../../biomimicry/semanticGuardian.js';
import { MUTATION_OPERATOR_NAMES } from '../../biomimicry/types.js';
import { execGitShortHead } from '../../core/git/gitCommand.js';
import { isGitRepository } from '../../core/git/gitRepositoryHandle.js';
import { logger } from '../../shared/logger.js';
import { THERMAL_POLICY_DEFAULTS } from '../../thermodynamics/types.js';

export interface MantekaStatus {
  readonly root: string;
  /** null when the directory is not a Git repository or has no commits yet. */
  readonly head: string | null;
  readonly lawsPresent: boolean;
  readonly lawCount: number;
  readonly lineageWins: number;
  /** Normalised epigenetic weights (sum to 1) over the declared operators. */
  readonly operatorWeights: Record<string, number>;
  readonly tMax: number;
}

export interface StatusDeps {
  isGitRepository: (directory: string) => Promise<boolean>;
  execGitShortHead: (directory: string) => Promise<string>;
  loadLineage: (repoRoot: string) => Promise<Lineage>;
  /** Raw manifest text, or null when the guardian has no manifest at all. */
  readLaws: (repoRoot: string) => Promise<string | null>;
}

const defaultStatusDeps: StatusDeps = {
  isGitRepository,
  execGitShortHead,
  loadLineage,
  readLaws: async (repoRoot) => {
    try {
      return await fs.readFile(path.join(repoRoot, LAWS_FILE_NAME), 'utf8');
    } catch {
      return null;
    }
  },
};

/**
 * Collects the autonomy state of a repository: HEAD, whether the semantic
 * guardian has laws to enforce, how much lineage memory has accumulated and
 * what probabilities that memory currently grants each operator.
 */
export const gatherStatus = async (
  requestedRoot: string,
  deps: StatusDeps = defaultStatusDeps,
): Promise<MantekaStatus> => {
  const root = path.resolve(requestedRoot);
  const repository = await deps.isGitRepository(root).catch(() => false);
  const head = repository ? await deps.execGitShortHead(root).catch(() => null) : null;
  const lawsContent = await deps.readLaws(root);
  const lawCount = lawsContent === null ? 0 : parseLawsManifest(lawsContent).length;
  const lineage = await deps.loadLineage(root);

  return {
    root,
    head,
    lawsPresent: lawsContent !== null,
    lawCount,
    lineageWins: lineage.entries.length,
    operatorWeights: computeOperatorWeights(MUTATION_OPERATOR_NAMES, lineage),
    tMax: THERMAL_POLICY_DEFAULTS.tMax,
  };
};

const guardianLine = (status: MantekaStatus): string => {
  if (!status.lawsPresent) {
    return pc.dim(`○ inactive · no ${LAWS_FILE_NAME}`);
  }
  if (status.lawCount === 0) {
    return pc.dim('○ idle · manifest declares no laws');
  }
  return `${pc.green('● active')} · ${status.lawCount} law${status.lawCount === 1 ? '' : 's'}`;
};

/** Human panel for `manteka status`; pure so tests assert on text, not stdout. */
export const formatStatus = (status: MantekaStatus): string => {
  const lines: string[] = [
    pc.bold('🧬 Manteka Status'),
    `  Repository   ${status.root}`,
    `  HEAD         ${status.head ?? pc.dim('— (not a Git repository or no commits)')}`,
    `  Guardian     ${guardianLine(status)}`,
    `  Lineage      ${
      status.lineageWins > 0
        ? `${status.lineageWins} recorded win${status.lineageWins === 1 ? '' : 's'}`
        : pc.dim('cold start · no recorded wins yet')
    }`,
    `  Thermal      tMax ${status.tMax} (boiling threshold)`,
  ];

  if (status.lineageWins > 0) {
    lines.push(pc.bold('  Epigenetic weights'));
    const ranked = Object.entries(status.operatorWeights).sort((a, b) => b[1] - a[1]);
    for (const [operator, weight] of ranked) {
      const percent = `${(weight * 100).toFixed(0)}%`.padStart(4);
      const bar = '█'.repeat(Math.max(1, Math.round(weight * 20)));
      lines.push(`    ${operator.padEnd(22)} ${percent}  ${pc.cyan(bar)}`);
    }
  }

  return lines.join('\n');
};

/**
 * Registers the `status` subcommand. Lives under src/cli/commands/ alongside
 * heat and evolve so each subcommand owns its Commander wiring.
 */
export const registerStatusCommand = (program: Command): void => {
  program
    .command('status')
    .description('Show the evolution autonomy of a repository: guardian, lineage and epigenetic weights')
    .argument('[directory]', 'repository to inspect', '.')
    .action(async (directory: string) => {
      try {
        const status = await gatherStatus(directory);
        logger.log(formatStatus(status));
      } catch (error) {
        logger.error(pc.red(`✖ Status failed: ${(error as Error).message}`));
        process.exit(2);
      }
    });
};
