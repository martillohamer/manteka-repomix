# CI Local — Validación completa del pipeline

Este documento explica cómo ejecutar localmente la misma validación que ejecuta el pipeline de CI de GitHub Actions, sin necesidad de esperar a que se dispare un PR o un push.

## Requisitos previos

| Herramienta | Versión | Notas |
| --- | --- | --- |
| Node.js | `>=22.0.0` | CI usa 22.x, 24.x y 26.x. Recomendado: **24.15.0** (ver `.tool-versions`) |
| npm | `12.0.1` | Incluido con Node.js |
| Git | `>=2.30` | Necesario para `git diff --exit-code` post-lint |

## Instalación limpia (equivalente a `npm ci` de CI)

```powershell
npm ci
```

Esto elimina `node_modules/` y reinstala desde `package-lock.json`, garantizando un entorno idéntico al de CI.

## Ejecución rápida (todos los checks en secuencia)

```powershell
npm ci
npm run lint
npm run build
npx vitest run
node bin/repomix.cjs --version
```

Si todos los comandos devuelven exit `0`, el entorno local está impecable y equivalente a CI.

## Desglose por job de CI

### 1. Lint Biome (`lint-biome`)

```powershell
npm ci
node --run lint-biome
git diff --exit-code
```

- `lint-biome` ejecuta `biome check --write` (modifica archivos si hay problemas).
- `git diff --exit-code` verifica que Biome no cambió nada (el código ya estaba limpio).
- **En local:** si Biome modifica archivos, revierte con `git checkout -- .` antes de continuar.

### 2. Lint Oxlint (`lint-oxlint`)

```powershell
npm ci
node --run lint-oxlint
git diff --exit-code
```

- `lint-oxlint` ejecuta `oxlint --fix` (modifica archivos si hay problemas).
- Igual que Biome: si hay diff, el código no estaba limpio.

### 3. Typecheck (`lint-ts`)

```powershell
npm ci
node --run lint-ts
```

- Ejecuta `tsc --noEmit`. No modifica archivos.
- Es el único check de tipos del pipeline.

### 4. Secretlint (`lint-secretlint`)

```powershell
npm ci
node --run lint-secretlint
```

- Ejecuta `secretlint "**/*" --secretlintignore .gitignore`.
- Detecta secretos y credenciales en el código.

### 5. Tests (`test`)

```powershell
npm ci
node --run test -- --reporter=verbose
```

- Ejecuta Vitest en modo watch por defecto. En CI se pasa `--reporter=verbose`.
- **Para simular CI exactamente:** `npx vitest run --reporter=verbose` (modo run, no watch).

### 6. Coverage (`test-coverage`)

```powershell
npm ci
node --run test-coverage -- --reporter=verbose --reporter=junit --outputFile.junit=./test-report.junit.xml
```

- Genera `coverage/` y `test-report.junit.xml`.
- En CI se sube a Codecov (requiere `CODECOV_TOKEN`). Localmente puedes abrir `coverage/index.html` en el navegador.

### 7. Build (`build-and-run`)

```powershell
npm ci
node --run build -- --sourceMap --declaration
npm prune --omit=dev
node bin/repomix.cjs
node bin/repomix.cjs --version
node bin/repomix.cjs --help
```

- `build` ejecuta `rimraf lib && tsc -p tsconfig.build.json`.
- `npm prune --omit=dev` elimina dependencias de desarrollo (solo producción).
- Los tres comandos finales son smoke tests del binario compilado.

### 8. Lint de workflows (`ci-quality.yml`)

Estos jobs no afectan al código sino a los archivos de GitHub Actions:

| Job | Qué hace | Comando local |
| --- | --- | --- |
| `lint-actionlint` | Valida sintaxis de workflows | `actionlint` (requiere binario instalado) |
| `lint-zizmor` | Seguridad de workflows | `zizmor .github/workflows/*.yml` |
| `check-typos` | Detecta typos en el repo | `typos` |

No son bloqueantes para desarrollo local salvo que modifiques `.github/workflows/`.

### 9. Browser Extension (`ci-browser.yml`)

Solo se ejecuta cuando cambian archivos en `browser/`:

```powershell
cd browser
npm ci
node --run prepare
node --run lint
node --run test
cd ..
```

## Matriz de CI vs entorno local

| Dimensión | CI (GitHub Actions) | Local (Windows) |
| --- | --- | --- |
| OS | ubuntu, windows, macos | Windows |
| Node.js | 22.x, 24.x, 26.x | 24.15.0 (recomendado) |
| Instalación | `npm ci` | `npm ci` |
| Lint | 4 jobs separados | `npm run lint` (secuencial) |
| Tests | `vitest run --reporter=verbose` | `npx vitest run --reporter=verbose` |
| Coverage | `vitest run --coverage` + Codecov | `npx vitest run --coverage` |
| Build | `tsc` + smoke test | `npm run build` + smoke test |

## Notas importantes

### Tests que fallan por locale

En Windows con locale `es-ES`, 2 tests de Vitest fallan por formato de números/decimales:

- `tests/cli/cliTokenBudget.test.ts` — `validateTokenBudget`
- `tests/core/skill/skillStatistics.test.ts` — `generateStatisticsSection`

En CI (ubuntu-latest, locale `en-US`) estos tests **pasan**. No son regresiones del código sino diferencias de locale del sistema operativo.

### Los linters modifican archivos

`lint-biome` y `lint-oxlint` usan `--write` / `--fix`. Si el código no está limpio, modificarán archivos. Para verificar sin modificar:

```powershell
npx biome check
npx oxlint
```

### `npm ci` vs `npm install`

- `npm ci`: elimina `node_modules/` y reinstala desde el lockfile. **Es lo que usa CI.**
- `npm install`: actualiza el lockfile si hay discrepancias. No usar para simular CI.

## Resumen de comandos esenciales

```powershell
# Instalación limpia
npm ci

# Todos los linters en secuencia (modifican archivos)
npm run lint

# Typecheck sin modificar
npx tsc --noEmit

# Build
npm run build

# Tests (modo run, como CI)
npx vitest run --reporter=verbose

# Coverage
npx vitest run --coverage

# Smoke test del binario
node bin/repomix.cjs --version
```
