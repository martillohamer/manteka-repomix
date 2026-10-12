/**
 * Diagnósticos de salud del entorno, compartidos por el subcomando `manteka doctor`
 * y por la herramienta MCP `manteka_doctor`.
 *
 * Vive en `core` para que ambas capas (CLI y MCP) consuman exactamente la misma
 * lógica en lugar de duplicarla y divergir.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as process from 'node:process';

export type DoctorCheckStatus = 'ok' | 'warn' | 'fail';

export interface DoctorCheckResult {
  status: DoctorCheckStatus;
  message: string;
}

/** Versión mínima de Node soportada por el motor. */
export const DOCTOR_MIN_NODE_MAJOR = 18;

/**
 * Comprueba la compatibilidad de la versión de Node.js en ejecución.
 */
export const checkNodeVersion = (): DoctorCheckResult => {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);

  if (!Number.isNaN(major) && major >= DOCTOR_MIN_NODE_MAJOR) {
    return { status: 'ok', message: `Node.js ${version} (compatible)` };
  }

  if (!Number.isNaN(major) && major >= 14) {
    return {
      status: 'warn',
      message: `Node.js ${version} (below supported ${DOCTOR_MIN_NODE_MAJOR}; consider upgrading)`,
    };
  }

  return { status: 'fail', message: `Node.js ${version} (too old, requires ${DOCTOR_MIN_NODE_MAJOR}+)` };
};

/**
 * Verifica que el proceso pueda crear, leer y borrar un archivo en el directorio
 * temporal, que es lo que necesita el motor para materializar sus artefactos.
 *
 * `EPERM` se degrada a `warn` en lugar de `fail`: en Windows `fs.realpath`/`mkdir`
 * lanzan `EPERM` sobre rutas perfectamente accesibles (típicamente las rutas 8.3 de
 * temp, p. ej. `C:\Users\RUNNER~1`), así que tratarlo como fallo marcaría entornos
 * sana como rotos. El resto de errores sí son fallos reales.
 */
export const checkFileSystemPermissions = (): DoctorCheckResult => {
  const testFile = path.join(os.tmpdir(), `manteka-doctor-${Date.now()}.tmp`);

  try {
    fs.writeFileSync(testFile, 'manteka');
    fs.appendFileSync(testFile, '\n');
    fs.readFileSync(testFile, 'utf-8');
    fs.unlinkSync(testFile);

    return { status: 'ok', message: 'File read/write permissions OK' };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM') {
      return {
        status: 'warn',
        message: 'File permission issue (EPERM) - may need elevated privileges on Windows',
      };
    }
    return { status: 'fail', message: `File permission error: ${(error as Error).message}` };
  }
};

/**
 * Valida la integridad del almacén de lineage (NDJSON) del directorio actual.
 *
 * Un archivo ausente o vacío degrada a `warn`, no a `fail`: la ausencia de lineage
 * es el estado normal de un proyecto recién clonado.
 */
export const checkLineageIntegrity = (cwd: string = process.cwd()): DoctorCheckResult => {
  const lineagePath = path.join(cwd, '.manteka', 'memory', 'lineage.ndjson');

  try {
    if (!fs.existsSync(lineagePath)) {
      return { status: 'warn', message: 'Lineage file not found at expected path' };
    }

    const content = fs.readFileSync(lineagePath, 'utf-8').trim();
    if (!content) {
      return { status: 'warn', message: 'Lineage file is empty' };
    }

    const lines = content.split('\n');
    let validLines = 0;
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      try {
        JSON.parse(line);
        validLines++;
      } catch {
        // Una línea corrupta no invalida el resto del almacén; se contabiliza aparte.
      }
    }

    if (validLines === 0) {
      return { status: 'warn', message: 'Lineage file contains no valid JSON entries' };
    }

    return {
      status: 'ok',
      message: `Lineage file OK - ${validLines} valid entries out of ${lines.length} lines`,
    };
  } catch (error) {
    return { status: 'fail', message: `Lineage file error: ${(error as Error).message}` };
  }
};

/**
 * Comprueba que los metadatos de configuración del proyecto sean coherentes.
 */
export const checkConfigIntegrity = (cwd: string = process.cwd()): DoctorCheckResult => {
  const issues: string[] = [];

  const packageJsonPath = path.join(cwd, 'package.json');
  try {
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
        name?: string;
        version?: string;
      };
      if (!pkg.name) {
        issues.push('package.json missing "name" field');
      }
      if (!pkg.version) {
        issues.push('package.json missing "version" field');
      }
    } else {
      issues.push('package.json not found');
    }
  } catch (error) {
    issues.push(`package.json parse error: ${(error as Error).message}`);
  }

  const serverJsonPath = path.join(cwd, 'server.json');
  try {
    if (fs.existsSync(serverJsonPath)) {
      const server = JSON.parse(fs.readFileSync(serverJsonPath, 'utf-8')) as {
        serverName?: string;
      };
      if (!server.serverName) {
        issues.push('server.json missing "serverName" field');
      }
    } else {
      issues.push('server.json not found (optional)');
    }
  } catch (error) {
    issues.push(`server.json parse error: ${(error as Error).message}`);
  }

  if (issues.length === 0) {
    return { status: 'ok', message: 'Configuration metadata OK' };
  }

  return { status: 'warn', message: `Configuration issues: ${issues.join('; ')}` };
};

export interface DoctorNamedCheck extends DoctorCheckResult {
  name: string;
}

/**
 * Ejecuta la batería completa de diagnósticos y devuelve un resultado con nombre.
 */
export const runDoctorChecks = (cwd: string = process.cwd()): DoctorNamedCheck[] => {
  const checks: Array<{ name: string; fn: () => DoctorCheckResult }> = [
    { name: 'Node.js Version', fn: checkNodeVersion },
    { name: 'File System Permissions', fn: checkFileSystemPermissions },
    { name: 'Memory Lineage Integrity', fn: () => checkLineageIntegrity(cwd) },
    { name: 'Configuration Integrity', fn: () => checkConfigIntegrity(cwd) },
  ];

  return checks.map((check) => {
    try {
      return { name: check.name, ...check.fn() };
    } catch (error) {
      return { name: check.name, status: 'fail' as const, message: `Check error: ${(error as Error).message}` };
    }
  });
};