/**
 * manteka doctor: Diagnóstico de entorno y salud del sistema
 *
 * Evalúa la salud del entorno de trabajo: versión de Node.js, permisos de
 * archivos, integridad de memoria lineage y configuración.
 *
 * Los diagnósticos viven en `core/doctor/checks` y se comparten con la
 * herramienta MCP `manteka_doctor`, de modo que ambas capas reportan lo mismo.
 */
import { Command } from 'commander';
import * as process from 'node:process';
import { runDoctorChecks, type DoctorCheckStatus } from '../../core/doctor/checks.js';

const ICONS: Record<DoctorCheckStatus, string> = {
  ok: '✅',
  warn: '⚠️',
  fail: '❌',
};

/**
 * Runs the doctor command - environment health check
 */
const runDoctor = async (): Promise<void> => {
  console.log('=== Manteka Environment Health Check ===\n');

  const results = runDoctorChecks(process.cwd());

  results.forEach((result, index) => {
    console.log(`  ${index + 1}. ${ICONS[result.status]} ${result.name}`);
    console.log(`     ${result.message}`);
  });

  const allOk = results.every((result) => result.status === 'ok');
  // Only a hard failure is non-zero. Warnings (an absent lineage store, an optional
  // server.json field) are informational and must not make `manteka doctor` unusable
  // as a CI gate — otherwise every nitpick turns the command red.
  const hasFailure = results.some((result) => result.status === 'fail');

  console.log();
  if (hasFailure) {
    console.log('🔴 One or more checks failed - see above');
  } else if (allOk) {
    console.log('🟢 All checks passed - environment is healthy');
  } else {
    console.log('🟡 Some checks had warnings - review above');
  }

  if (hasFailure) {
    process.exit(1);
  }
};

/**
 * Registers the `doctor` subcommand on the given Commander program
 */
export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose environment health and system status')
    .action(async () => {
      await runDoctor();
    });
}

export { runDoctor };