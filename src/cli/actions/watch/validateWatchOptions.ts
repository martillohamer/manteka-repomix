import { isExplicitRemoteUrl } from '../../../core/git/gitRemoteUrl.js';
import { RepomixError } from '../../../shared/errorHandle.js';
import type { CliOptions } from '../../types.js';

/**
 * Validates flags that cannot be combined with --watch. Runs before log-level
 * changes so error messages are not suppressed by --quiet/--stdout.
 *
 * Extracted from cliRun.ts so the watch-specific incompatibility matrix has a
 * single home next to the rest of the watch pipeline and cliRun.ts stays inside
 * the line budget the CI ratchet audits.
 */
export const validateWatchOptions = (directories: string[], options: CliOptions): void => {
  if (!options.watch) {
    return;
  }
  if (options.remote) {
    throw new RepomixError('--watch cannot be used with --remote. Watch mode only works with local directories.');
  }
  if (options.stdout) {
    throw new RepomixError('--watch cannot be used with --stdout. Watch mode writes to a file.');
  }
  if (options.stdin) {
    throw new RepomixError('--watch cannot be used with --stdin. Watch mode discovers files automatically.');
  }
  if (options.copy) {
    throw new RepomixError(
      '--watch cannot be used with --copy. Watch mode re-packs on every change, which would repeatedly overwrite the clipboard.',
    );
  }
  if (options.splitOutput) {
    throw new RepomixError(
      '--watch cannot be used with --split-output. Watch mode does not yet support split output files.',
    );
  }
  if (options.skillGenerate !== undefined) {
    throw new RepomixError(
      '--watch cannot be used with --skill-generate. Watch mode does not support skill generation.',
    );
  }
  if (directories.length === 1 && isExplicitRemoteUrl(directories[0])) {
    throw new RepomixError('--watch cannot be used with remote URLs. Watch mode only works with local directories.');
  }
};
