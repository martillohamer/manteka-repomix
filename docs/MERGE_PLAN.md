# Plan maestro de merge y directrices de publicación MCP

Documento operativo para integrar los siete Pull Requests de la fase de consolidación en `main` del fork `DAW1BSergiomg26/manteka-repomix`, y para decidir de forma definitiva sobre el espacio de nombres del MCP Registry antes de publicar nada.

**Base de trabajo:** `origin/main` @ `0b3f82b4`
**Alcance:** Fases 0 a 6 (PRs #1 a #7), más la preparación de publicación
**Estado de los 7 PRs:** los siete son `MERGEABLE` con estado `CLEAN` en GitHub

---

## 1. Resumen ejecutivo

La integración es viable y fue simulada completa antes de redactar este plan. Los siete PRs se aplican en orden con **cero conflictos**, y el árbol resultante pasa lint, compilación y typecheck con exit 0.

Sin embargo, la simulación también arroja un defecto que bloquea la publicación: **el PR #6 renombra el paquete a `manteka-repomix` pero deja `repomix` hardcodeado en los dos workflows de publicación.** Ese estado rompería el release en el paso `Pack`, antes de llegar al Registry. La sección 4 documenta el fallo con evidencia y la corrección.

**Recomendación: mergear #1 a #5 de inmediato; corregir #6 con un commit adicional antes de mergearlo.** Los PRs #1 a #5 son independientes del renombrado y no bloquean nada.

---

## 2. Orden de merge

El orden no es arbitrario. Dos dependencias reales lo condicionan.

| Pos | PR | Rama | Motivo de la posición |
| --- | --- | --- | --- |
| 1 | #1 | `docs/fase-0-arquitectura` | Puramente aditivo, sin dependencias. Establece el mapa mental. |
| 2 | #2 | `chore/fase-1-baseline` | Corrige el lockfile. Antes que nada que ejecute `npm ci`. |
| 3 | #3 | `chore/fase-2-gitattributes` | **Normaliza el índice. Debe preceder a todo cambio de código.** |
| 4 | #4 | `chore/fase-3-ci-checks` | Aditivo. Documenta el pipeline ya existente. |
| 5 | #5 | `feat/fase-4-custom-prep` | Aditivo. Mapa de puntos de extensión. |
| 6 | #6 | `feat/fase-5-branding` | **Requiere el commit correctivo de la sección 4.** |
| 7 | #7 | `chore/fase-6-consolidation` | Último: el resumen debe reflejar el estado final. |

### 2.1. Por qué #3 debe ir antes que el branding

El PR #3 normaliza los finales de línea de todo el repositorio y añade las reglas en `.gitattributes`. El PR #6 modifica 15 ficheros de texto. Si #6 se mergea antes, esos 15 ficheros entran con finales de línea inconsistentes y el merge posterior de #3 genera un diff que mezcla normalización y rebranding en las mismas líneas. El resultado es un PR imposible de revisar y un blame inútil. Normalizar primero mantiene cada commit legible.

### 2.2. Por qué #2 debe ir pronto

El PR #2 corrige 3 vulnerabilidades transitivas del lockfile. Mientras no se mergee, cualquier rama posterior que ejecute `npm audit` las reporta, aunque no las haya reintroducido. Mergearlo pronto elimina ese ruido de validación para el resto del trabajo.

---

## 3. Procedimiento de merge

### 3.1. Precondiciones

```powershell
cd C:\Users\astur\Desktop\manteka-repomix
git checkout main
git fetch origin --prune
git status              # debe salir limpio antes de empezar
```

Verifica que los siete PRs siguen siendo fusionables antes de tocar nada:

```powershell
gh pr list --repo DAW1BSergiomg26/manteka-repomix --state open `
  --json number,headRefName,mergeable,mergeStateStatus `
  --jq '.[] | "#\(.number) \(.headRefName) \(.mergeable) \(.mergeStateStatus)"'
```

Si algún PR aparece como `CONFLICTING` o `UNKNOWN`, detente: el plan fue validado sobre `0b3f82b4` y una base movida invalida sus garantías.

### 3.2. Estrategia de merge

**Usa merge commit, no squash ni rebase.**

```powershell
gh pr merge 1 --repo DAW1BSergiomg26/manteka-repomix --merge --delete-branch=false
```

Razones:

- Los siete PRs nacieron de `0b3f82b4` y se solapan en el lockfile (#2), en las notas de release (#3) y en `package.json`/`server.json` (#6). Un squash reescribiría el commit base de cada uno y obligaría a resolver conflictos en el servidor, donde no se puede verificar nada.
- Con merge commit, cada fase queda identificada en el historial por su PR. La auditoría de "qué cambió en cada fase" sigue siendo posible dentro de un año.
- `--delete-branch=false` es deliberado: hasta que los siete estén mergeados, las ramas son la única copia de los diffs limpio.

### 3.3. Merge secuencial con verificación

Mergear uno por vez y validar entre merges. No encadenes los siete comandos: si el quinto falla, el estado de los anteriores ya está en `main` y necesitas saber exactamente hasta dónde llegó.

```powershell
foreach ($n in 1,2,3,4,5) {
  gh pr merge $n --repo DAW1BSergiomg26/manteka-repomix --merge --delete-branch=false
  if ($LASTEXITCODE -ne 0) { throw "PR #$n no se pudo mergear. Detenerse aqui." }
  git checkout main; git pull --ff-only
  npm ci
  npm run lint
  git diff --exit-code      # si falla, el linter toco ficheros
}
```

El `git diff --exit-code` es la comprobación que replica exactamente el paso `lint-biome` de CI: los linters ejecutan `biome check --write` y `oxlint --fix`, así que un fallo ahí significa que había formato pendiente en el merge.

### 3.4. Mergear #6 solo después del commit correctivo

```powershell
# 1. Aplicar el commit correctivo sobre la rama de #6 (seccion 4)
git checkout feat/fase-5-branding
git pull origin feat/fase-5-branding
# ... aplicar los cambios de la seccion 4 ...
git commit -m "fix(release): Parametriza el nombre del paquete en los workflows de publicacion"
git push origin feat/fase-5-branding

# 2. Verificar que CI local sigue verde antes de mergear
npm ci; npm run lint; npm run build; npx tsc --noEmit; npx vitest run

# 3. Mergear
gh pr merge 6 --repo DAW1BSergiomg26/manteka-repomix --merge --delete-branch=false
```

### 3.5. Cierre

```powershell
git checkout main
git pull --ff-only

# Verificacion post-merge final
npm ci
npm run lint
npx tsc --noEmit
npm run build
npx vitest run

git branch -d docs/fase-0-arquitectura chore/fase-1-baseline chore/fase-2-gitattributes `
             chore/fase-3-ci-checks feat/fase-4-custom-prep feat/fase-5-branding `
             chore/fase-6-consolidation
```

Las ramas locales se borran una vez los siete PRs estén en `main`. Las remotas, cuando decidas cerrar los PRs.

---

## 4. Defecto bloqueante: `repomix` hardcodeado en los workflows de publicación

### 4.1. Qué ocurre

El PR #6 renombra el paquete en `package.json` de `repomix` a `manteka-repomix`. Pero los dos workflows de publicación derivan el nombre del paquete **por interpolación de cadena, no leyéndolo de `package.json`**:

`.github/workflows/npm-publish.yml`
```yaml
L94:  echo "tarball=repomix-${PACKAGE_VERSION}.tgz"
L104: if npm view "repomix@${PACKAGE_VERSION}" version 2>/dev/null; then
```

`.github/workflows/mcp-registry-publish.yml`
```yaml
L81: if PUBLISHED_MCP_NAME=$(npm view "repomix@${PACKAGE_VERSION}" mcpName); then
L85: echo "::error::repomix@${PACKAGE_VERSION} is not visible on npm"
L92: echo "::error::repomix@${PACKAGE_VERSION} is published but has no mcpName field"
L99: echo "repomix@${PACKAGE_VERSION} is published with mcpName=${PUBLISHED_MCP_NAME}"
```

`PACKAGE_VERSION` sí se lee de `package.json`, pero el nombre del paquete no. Queda literal.

### 4.2. Cómo falla

El paso `Pack` de `npm-publish.yml` ejecuta `npm pack` y después comprueba que el tarball exista con el nombre anunciado:

```console
$ npm pack --pack-destination .
npm notice filename: manteka-repomix-1.18.1.tgz

$ test -f repomix-1.18.1.tgz
NO EXISTE -> exit 1
```

`npm pack` deriva el nombre del fichero de `package.json#name`. Con `manteka-repomix` genera `manteka-repomix-1.18.1.tgz`, mientras el workflow espera `repomix-1.18.1.tgz`. **El release se rompe en el primer job de `npm-publish.yml`, antes de publicar nada en npm y mucho antes de tocar el MCP Registry.**

Peor aún, si el nombre se corrigiera solo en la línea 94 y no en la 104, el guardián de "versión ya publicada" consultaría `repomix@1.18.1` en npm. Como ese paquete **existe y es de yamadashy**, el check passes, cree que la versión ya está publicada y aborta con un error engañoso.

### 4.3. Corrección

Parametrizar el nombre desde `package.json`, igual que ya se hace con la versión.

En `.github/workflows/npm-publish.yml`, el paso `Resolve versions`:

```yaml
      - name: Resolve versions
        id: meta
        run: |
          NODE_VERSION=$(awk '$1 == "nodejs" { print $2; exit }' .tool-versions)
          PACKAGE_VERSION=$(node -p "require('./package.json').version")
          PACKAGE_NAME=$(node -p "require('./package.json').name")
          test -n "${NODE_VERSION}"
          {
            echo "node-version=${NODE_VERSION}"
            echo "package-version=${PACKAGE_VERSION}"
            echo "package-name=${PACKAGE_NAME}"
            echo "tarball=${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz"
          } >> "${GITHUB_OUTPUT}"
```

Y el paso `Check if version already published`:

```yaml
      - name: Check if version already published
        env:
          PACKAGE_VERSION: ${{ steps.meta.outputs.package-version }}
          PACKAGE_NAME: ${{ steps.meta.outputs.package-name }}
        run: |
          if npm view "${PACKAGE_NAME}@${PACKAGE_VERSION}" version 2>/dev/null; then
            echo "::error::Version ${PACKAGE_VERSION} is already published to npm"
            exit 1
          fi
          echo "Version ${PACKAGE_VERSION} is not yet published"
```

En `.github/workflows/mcp-registry-publish.yml`, el paso de verificación de npm:

```yaml
      - name: Verify the npm release exists and carries the matching mcpName
        if: ${{ !inputs.dry-run }}
        env:
          npm_config_min_release_age: 0
          SERVER_NAME: ${{ hashFiles('server.json') }}
        run: |
          PACKAGE_VERSION=$(node -p "require('./package.json').version")
          PACKAGE_NAME=$(node -p "require('./package.json').name")
          SERVER_NAME=$(node -p "require('./server.json').name")
          for attempt in 1 2 3 4 5; do
            if PUBLISHED_MCP_NAME=$(npm view "${PACKAGE_NAME}@${PACKAGE_VERSION}" mcpName); then
              break
            fi
            if [ "${attempt}" -eq 5 ]; then
              echo "::error::${PACKAGE_NAME}@${PACKAGE_VERSION} is not visible on npm"
              exit 1
            fi
            echo "npm metadata not visible yet, retrying in 10s (${attempt}/5)"
            sleep 10
          done
          if [ -z "${PUBLISHED_MCP_NAME}" ]; then
            echo "::error::${PACKAGE_NAME}@${PACKAGE_VERSION} is published but has no mcpName field"
            exit 1
          fi
          if [ "${PUBLISHED_MCP_NAME}" != "${SERVER_NAME}" ]; then
            echo "::error::mcpName on npm (${PUBLISHED_MCP_NAME}) does not match server.json name (${SERVER_NAME})"
            exit 1
          fi
          echo "${PACKAGE_NAME}@${PACKAGE_VERSION} is published with mcpName=${PUBLISHED_MCP_NAME}"
```

Los cuatro mensajes de error también deben usar `${PACKAGE_NAME}`: un mensaje de error que mienta sobre el paquete consultado cuesta horas de depuración.

### 4.4. Corrección mínima si se prefiere el mínimo cambio

Si no quieres refactorizar los workflows, la alternativa de una línea es **no renombrar el paquete** y mantener `name: repomix` en `package.json`. Se conserva entonces el branding visible (CLI, MCP, cabeceras, `title`) y se renuncia al nombre de paquete propio. Es la opción más conservadora, pero deja el proyecto ocupando un nombre que no le pertenece en npm.

---

## 5. Decisión definitiva: espacio de nombres del MCP Registry

### 5.1. Qué impone la infraestructura

El workflow `mcp-registry-publish.yml` hace login con `mcp-publisher login github-oidc`. El OIDC de GitHub solo puede publicar bajo `io.github.<propietario-del-repositorio>/`. Publicar bajo `io.github.yamadashy/` desde el fork de Sergio **es imposible**, no una cuestión de permisos del Registry: la identidad criptográfica que presenta es la del fork.

El test `tests/mcp/serverJson.test.ts` lo formaliza:

```typescript
test('the server name uses the GitHub namespace required by the publish workflow', () => {
  // `mcp-publisher login github-oidc` can only publish under io.github.<owner>/.
  expect(serverJson.name).toMatch(/^io\.github\.[^/]+\/[^/]+$/);
});
```

Observa la forma de la aserción: valida el **patrón**, no el propietario. `io.github.DAW1BSergiomg26/manteka-repomix` la satisface igual que `io.github.yamadashy/repomix`. Los tests pasan en ambos casos, lo que significa que **el paso obligatorio de verificación no detecta un namespace equivocado**.

### 5.2. Decisión

**Se mantiene el espacio de nombres del fork: `io.github.DAW1BSergiomg26/manteka-repomix`.**

Justificación:

1. **Es la única opción publicable.** El OIDC presented por el workflow pertenece al fork. Intentar el namespace del upstream produce un rechazo en el paso de login, antes incluso de validar el `server.json`.
2. **Evita una colisión de propiedad.** El namespace del upstream pertenece a `yamadashy`. Publicar allí desde otro repositorio no sería una contribución: sería suplantación de identidad en un directorio público.
3. **El Registry valida la propiedad contra el paquete npm publicado.** El `server.json` del fork declara `identifier: manteka-repomix`. Mientras exista correspondencia entre `mcpName`, `name` y el paquete real, la publicación es legítima y trazable.
4. **Mantener el namespace del upstream no aportaría nada.** Si el objetivo fuese figurar bajo el nombre de yamadashy, lo correcto sería abrir un PR en el upstream, no publicar desde el fork.

### 5.3. Comandos de verificación (no hay ajuste que ejecutar)

La decisión es mantener lo que el PR #6 ya propone, así que **no hay cambio de código que aplicar**. Los comandos siguientes verifican que el estado sea correcto:

```powershell
# 1. Los tres identificadores coinciden entre si
node -p "require('./package.json').mcpName"                    # io.github.DAW1BSergiomg26/manteka-repomix
node -p "require('./server.json').name"                        # io.github.DAW1BSergiomg26/manteka-repomix
node -p "require('./server.json').packages[0].identifier"      # manteka-repomix
node -p "require('./package.json').name"                       # manteka-repomix

# 2. El contrato lo valida en verde
npx vitest run tests/mcp/serverJson.test.ts

# 3. Validacion de esquema contra el Registry, sin publicar
#    (workflow manual con dry-run: true en GitHub Actions)
```

Si en el futuroisse quisiera volver al namespace del upstream, el ajuste sería:

```powershell
# En server.json y package.json, sustituir:
#   io.github.DAW1BSergiomg26/manteka-repomix
# por:
#   io.github.yamadashy/repomix
node -e "const f='package.json',p=require('./'+f);p.mcpName='io.github.yamadashy/repomix';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
node -e "const f='server.json',s=require('./'+f);s.name='io.github.yamadashy/repomix';require('fs').writeFileSync(f,JSON.stringify(s,null,2)+'\n')"
npx vitest run tests/mcp/serverJson.test.ts
```

Ese cambio **no debe hacerse en este repositorio**: solo sería correcto si el código volviera a estar alojado en `yamadashy/repomix`.

### 5.4. Metadatos residuales que conviene revisar

PR #6 corrige `name`, `title`, `repository.url` e `identifier` en `server.json`, pero deja dos campos apuntando al upstream:

| Campo | Valor actual | Nota |
| --- | --- | --- |
| `websiteUrl` | `https://repomix.com` | Sitio del upstream. **No verificado por ningún test.** |
| `repository.id` | `828119367` | ID de `yamadashy/repomix` en GitHub. **No verificado por ningún test.** |
| `description` | texto en inglés | Límite de 100 caracteres impuesto por el Registry. Correcto tal cual. |

`repository.id` es el más delicado: es un identificador numérico de GitHub que el Registry puede usar para resolver el repositorio de origen. Apuntar al ID equivocado es una inconsistencia de metadatos que nadie detectará automáticamente. El ID correcto del fork debe obtenerse de su API y sustituir al actual. `websiteUrl` requiere una decisión editorial: si el fork no tiene web propia, lo honesto es retirarlo del `server.json` o apuntar al repositorio.

Ninguno de los dos bloquea la publicación, y ninguno lo detecta la suite actual. Se documentan aquí para que la decisión sea consciente.

---

## 6. Validación post-merge simulada

Antes de redactar este plan, los siete PRs se aplicaron localmente en el orden de la sección 2 y se validó el resultado. La simulación se hizo en una rama desechable que luego se descartó; `chore/fase-7-merge-plan` parte de `main` limpio.

### 6.1. Resultado del merge

| PR | Merge | Conflictos |
| --- | --- | --- |
| #1 | `1bc4b517` (merge commit) | Ninguno |
| #2 | Aplicado | Ninguno |
| #3 | Aplicado | Ninguno |
| #4 | Aplicado | Ninguno |
| #5 | Aplicado | Ninguno |
| #6 | Aplicado | Ninguno |
| #7 | Final | Ninguno |

Los siete PRs comparten `0b3f82b4` como base y no se solapan en los mismos ficheros salvo el lockfile (#2) y `package.json`/`server.json` (#6), donde el solapamiento es de contexto adyacente y Git lo resuelve sin intervención.

### 6.2. Estado del árbol resultante

Los cinco documentos coexisten sin colisión de nombres:

```
docs/ARQUITECTURA.md      (PR #1)
docs/BASELINE.md          (PR #2)
docs/CI_LOCAL.md          (PR #4)
docs/CONSOLIDACION.md     (PR #7)
docs/CUSTOM_PREP.md        (PR #5)
```

### 6.3. Validación del árbol fusionado

| Comprobación | Exit | Resultado |
| --- | --- | --- |
| `npm run lint` | 0 | Biome 494 ficheros, 3 warnings preexistentes, 0 errores; Oxlint 0/0 |
| `npm run build` | 0 | Sin errores |
| `npx tsc --noEmit` | 0 | Sin errores de tipos |
| `npx vitest run` | 1 | 150/152 ficheros pasan, 1 omitido, 2 fallan (locale) |
| `npx vitest run tests/mcp/serverJson.test.ts` | 0 | 1/1 pasa |
| `git status` | — | Árbol limpio tras los siete merges |

### 6.4. `.gitattributes` activo tras el merge

Con el PR #3 fusionado, los atributos se resuelven correctamente sobre ficheros clave:

```console
$ git check-attr text eol -- package.json server.json src/index.ts docs/CONSOLIDACION.md
package.json:            text: auto   eol: lf
server.json:             text: auto   eol: lf
src/index.ts:           text: auto   eol: lf
docs/CONSOLIDACION.md:   text: auto   eol: lf
```

Este es el criterio de aceptación del PR #3: los atributos deben aplican a ficheros creados **después** del merge, no solo a los ya normalizados.

### 6.5. Lo que la simulación no cubre

La simulación valida el merge del código. **No ejecuta los workflows de publicación**, que requieren credenciales de OIDC, un secreto `NPM_TOKEN` y la publicación previa en npm. Por eso el defecto de la sección 4 se detectó leyendo los workflows, no se observan en ejecución: los pasos fallidos ocurren en runners de GitHub Actions, no en local.

---

## 7. Lista de verificación antes de publicar

- [ ] Los siete PRs están mergeados en `main` con merge commit
- [ ] El commit correctivo de la sección 4 está aplicado y pusheado a `feat/fase-5-branding`
- [ ] `npm-publish.yml` y `mcp-registry-publish.yml` leen el nombre del paquete desde `package.json`
- [ ] `npm view manteka-repomix` devuelve 404: el nombre está libre en npm
- [ ] El paquete `manteka-repomix` está publicado en npm con `--provenance --access public`
- [ ] El `mcpName` del paquete publicado coincide con `server.json#name`
- [ ] Decisión tomada sobre `websiteUrl` y `repository.id` en `server.json`
- [ ] `mcp-registry-publish.yml` ejecutado con `dry-run: true` antes del envío real
- [ ] La documentación de instalación (`README.md`, `website/`) refleja el nuevo nombre de paquete

---

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Publicar en el Registry con un `server.json` desalineado de `package.json` | El Registry rechaza tras haber publicado el npm, y la versión npm es inmutable | El commit correctivo y el check `Verify the npm release exists` |
| Ocupar el nombre `manteka-repomix` en npm sin querer | Publicar sobre un paquete ajeno | Verificar con `npm view manteka-repomix` antes del primer release |
| `repository.id` apuntando al upstream | Metadatos incorrectos en el Registry, no detectados por tests | Sección 5.4 |
| Ningún PR tiene checks de CI | Un error de merge no se detecta en GitHub | La validación local de la sección 3.3 es obligatoria |
| Los 2 tests de locale fallan siempre en local | Máscara para regresiones reales | Documentados como baseline conocido desde la Fase 1 |
| El upstream avanza durante la integración | `main` se mueve y los PRs pendientes quedan desalineados | Mergear antes de que el upstream actualice `package.json` |
