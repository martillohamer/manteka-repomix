# Línea base de verificación (Fase 1)

Registro de la verificación reproducible del repositorio sobre un entorno Windows 11 limpio.
Sirve como punto de comparación para detectar regresiones en fases posteriores.

- **Fecha:** 2026-09-30
- **Rama:** `chore/fase-1-baseline`
- **Base:** `main` @ `0b3f82b4`
- **Sistema operativo:** Windows 11 (win32, x64)

## 1. Versiones del entorno

Las versiones se fijan en `.tool-versions` y son la referencia obligatoria:

| Herramienta | Versión declarada | Versión usada | Estado |
| --- | --- | --- | --- |
| Node.js | 24.15.0 | v24.15.0 | Correcto |
| npm | 12.0.1 | 12.0.1 | Correcto |
| Biome | ^2.5.14 | 2.5.14 | Correcto |
| Oxlint | ^1.83.0 | 1.83.0 | Correcto |
| Vitest | ^5.0.1 | 5.0.1 | Correcto |

Gestor de versiones: **nvm-windows 1.2.2** (`NVM_HOME=C:\Users\astur\AppData\Local\nvm`,
`NVM_SYMLINK=C:\nvm4w\nodejs`).

## 2. Instalación de dependencias

```bash
npm install
```

- Resultado: **correcto** (exit code 0), 312 paquetes instalados en ~14 s.
- El script `prepare` ejecuta `npm run build` automáticamente tras la instalación.
- `npm audit` tras la instalación inicial: 3 vulnerabilidades transitivas. Tras aplicar
  `npm audit fix` (sección 5): **0 vulnerabilidades**.

## 3. Pruebas automatizadas

```bash
npx vitest run
```

| Métrica | Valor |
| --- | --- |
| Archivos de prueba | 153 (150 correctos, 2 fallidos, 1 omitido) |
| Pruebas totales | 1843 |
| Pruebas superadas | 1818 |
| Pruebas fallidas | 2 |
| Pruebas omitidas | 23 |
| Duración | ~8–10 s |
| Código de salida | 1 |

### 3.1 Pruebas fallidas (preexistentes, no regresiones)

Ambas pruebas fallan exclusivamente por el **locale del sistema operativo**:

| Prueba | Archivo | Motivo |
| --- | --- | --- |
| `includes the actual and budget token counts in the message` | `tests/cli/cliTokenBudget.test.ts:23` | Espera `243,512`, recibe `243.512` |
| `should format large numbers with locale string` | `tests/core/skill/skillStatistics.test.ts:175` | Espera `10,000`, recibe `10.000` |

**Causa raíz:** el código de producción usa `Number.prototype.toLocaleString()` sin
locale explícito, por lo que adopta el locale del sistema. En esta máquina el locale ICU
por defecto es **`es-ES`**, cuyo separador de millares es el punto. Las pruebas asumen el
formato **`en-US`**, cuyo separador es la coma.

Evidencia:

- `Intl.DateTimeFormat().resolvedOptions().locale` devuelve `es-ES` tanto con Node 24.15.0
  como con Node 22.22.3, lo que descarta que la actualización de Node sea la causa.
- Con locale explícito, la misma aserción sí se cumple:
  `(243512).toLocaleString('en-US')` → `243,512`.
- En Node sobre Windows, las variables `LANG` y `LC_ALL` no modifican el locale ICU, que
  procede de la configuración regional del sistema.

**Naturaleza:** es un problema de portabilidad del suite de pruebas de upstream, no un
defecto introducido en esta fase ni un problema específico de Windows. El CI de upstream
ejecuta en `ubuntu-latest`, `windows-latest` y `macos-latest` sin fijar el locale, por lo que
el resultado puede variar según la configuración regional de cada runner.

**Decisión:** no se modifican los archivos de producción ni las pruebas de upstream en esta
fase. Se documenta el hallazgo para que se corrija en la rama que corresponda.

## 4. Calidad de código y typecheck

```bash
npm run lint      # biome + oxlint + tsc --noEmit + secretlint
npm run build     # rimraf lib && tsc -p tsconfig.build.json
```

| Comprobación | Resultado | Código de salida |
| --- | --- | --- |
| `lint-ts` (`tsc --noEmit`) | Sin errores | 0 |
| `lint-biome` (`biome check --write`) | Sin errores; 3 warnings preexistentes | 0 |
| `lint-oxlint` (`oxlint --fix`) | 0 warnings, 0 errores (427 archivos, 96 reglas) | 0 |
| `lint-secretlint` | Sin hallazgos | 0 |
| `npm run build` | Sin errores | 0 |

Los 3 warnings de Biome son preexistentes y no se corrigen en esta fase:

- `src/cli/cliSpinner.ts:21` — `suppressions/unused` (supresión `biome-ignore` no usada).
- `tests/core/file/binaryDetectionSpec.test.ts:44` — `lint/suspicious/noTemplateCurlyInString`.
- `bin/repomix.cjs:11` — `lint/complexity/useOptionalChain`.

## 5. Seguridad de dependencias

`npm audit` informa de 3 vulnerabilidades transitivas en el estado inicial
(`brace-expansion` alta, `fast-uri` y `ip-address` moderadas), todas con corrección
disponible sin `--force`.

```bash
npm audit fix
```

- Paquetes actualizados: `brace-expansion` 5.0.9 → 5.0.12, `fast-uri` 3.1.7 → 3.1.8,
  `ip-address` 10.4.0 → 10.7.2.
- `package-lock.json`: 9 inserciones y 9 eliminaciones. `package.json` sin cambios.
- `npm audit` posterior: **0 vulnerabilidades**.
- La suite de pruebas se reejecutó tras el cambio con resultados idénticos (1818 superadas,
  2 fallidas por locale, 23 omitidas), sin regresiones.

## 6. Notas de configuración específicas de Windows

### 6.1 Fin de línea: `core.autocrlf` (resuelto localmente)

El repositorio declara `end_of_line = lf` en `.editorconfig` y **no** incluye un archivo
`.gitattributes`. Con la configuración global de Windows `core.autocrlf = true`, el checkout
convierte los archivos de texto a CRLF, mientras Biome espera LF. Esto provocaba **431
errores de formato** que no existen en el repositorio: el blob de `HEAD` es LF y el árbol de
trabajo era CRLF.

Resolución aplicada en el clon local, sin modificar ningún archivo del repositorio:

```bash
git config --local core.autocrlf false
```

Después de normalizar el árbol de trabajo a LF, Biome pasa de 431 errores a 0.

Esta configuración es **local del clon y no forma parte de los cambios de esta fase**. Para
resolver el problema de raíz de forma permanente en el proyecto, la recomendación es añadir
un `.gitattributes` con `* text=auto eol=lf`, lo que debe tratarse como una fase aparte.

### 6.2 `esbuild` y los scripts de instalación de npm 12

npm 12.0.1 emite un aviso al bloquear el script `postinstall` de `esbuild@0.28.1` por no
estar cubierto por `allowScripts`. El aviso **no afecta al funcionamiento**: el binario
plataforma se resuelve mediante la dependencia opcional `@esbuild/win32-x64` y
`esbuild` responde correctamente con la versión 0.28.1. Se deja sin cambios.

## 7. Resumen

| Área | Estado |
| --- | --- |
| Node.js y npm conforme a `.tool-versions` | Correcto |
| Instalación de dependencias | Correcto |
| Typecheck (`tsc --noEmit`) | Correcto |
| Lint completo (Biome, Oxlint, secretlint) | Correcto, 3 warnings preexistentes |
| Build | Correcto |
| Pruebas | 1818/1843; 2 fallos preexistentes por locale, 23 omitidas |
| Vulnerabilidades de dependencias | 0 tras `npm audit fix` |
| Fin de línea en Windows | Resuelto localmente con `core.autocrlf=false` |
