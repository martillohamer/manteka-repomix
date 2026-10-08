# Acceso Git para la dependencia git de `repomix`

> Leer en español | [Read in English](GIT_ACCESS.md)

El paquete del servidor web (`website/server/`) consume este repositorio como
**dependencia git** en lugar de hacerlo desde el registro de npm:

```json
"repomix": "github:DAW1BSergiomg26/manteka-repomix#main"
```

`package-lock.json` la resuelve a un commit fijo por SSH:

```
git+ssh://git@github.com/DAW1BSergiomg26/manteka-repomix.git#0b3f82b401bbc520fd1aca67c06d24e40a868d3e
```

Fijar el commit es lo que hace que CI pruebe la compilación de *esta* rama en
lugar de aquello a lo que `#main` apunte en cada momento. Este documento explica
por qué la descarga no equivale a un simple `git clone` y cómo lo resuelve CI sin
que nadie configure un secreto a mano.

## Por qué falla la descarga por defecto

Dos obstáculos independientes separan a un runner alojado de esta dependencia.

**1. npm eleva la spec a SSH.** npm resuelve las dependencias git de GitHub por
`git+ssh://` con independencia del atajo `github:`, de modo que se le pide al
runner una clave SSH que no posee:

```
git@github.com: Permission denied (publickey).
fatal: Could not read from remote repository.
```

**2. La cuenta propietaria no es legible de forma anónima.** En el momento de
redactar este documento, las peticiones sin autenticar del perfil del propietario
*y de todos sus repositorios* devuelven `404 Not Found`, aunque la API informe del
repositorio como `public` cuando se consulta con credenciales. Por lo tanto,
reescribir la URL hacia HTTPS simple no basta por sí solo:

```
fatal: could not read Username for 'https://github.com': terminal prompts disabled
```

Como referencia, un repositorio público ajeno (`yamadashy/repomix`) sí se resuelve
y clona de forma anónima, lo que confirma que la incidencia es específica de la
cuenta propietaria y no un problema de red ni de proxy. Las respuestas proceden
del propio GitHub (`Server: github.com`, `X-GitHub-Request-Id` real).

Como el estado de la cuenta puede cambiar, la solución que se describe a
continuación employa una descarga autenticada sea cual sea la legibilidad
anónima del repositorio. Es correcta en ambos escenarios.

## Estrategia en CI

`.github/workflows/ci-website.yml` configura git en cada uno de los tres jobs del
servidor web (`lint-website-server`, `test-website-server`,
`bundle-website-server`) antes de ejecutar `npm ci`:

```bash
# Reescribe hacia HTTPS la forma SSH que npm impone ...
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
# ... y transporta el token como una cabecera extra HTTP.
git config --global "http.https://github.com/.extraheader" \
  "AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)"
```

`GH_TOKEN` procede del token automático del runner:

```yaml
env:
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Sin credenciales manuales

`GITHUB_TOKEN` lo emite GitHub Actions en cada job: nadie lo crea, lo rota ni lo
sube. Esto satisface el requisito de que CI funcione en runners públicos y
privados sin ningún secreto configurado a mano.

Como la dependencia apunta al *mismo* repositorio en el que se ejecuta el
workflow, el token automático basta para leerlo. Un token con ámbito sobre un
único repositorio no puede alcanzar un repositorio privado *distinto*, por lo
que habría que replantear el enfoque si la dependencia llegara a mudarse a otro
propietario; ese caso queda fuera del alcance actual.

### Propiedades de seguridad

- El token nunca se imprime: se pasa por el `env` del step y lo único que se
  escribe en la configuración de git es su forma base64, que no llega a los logs.
- `git config --global` escribe en el home efímero del runner y desaparece con él.
- No se versiona ningún token ni se referencia un secreto `PAT` o
  `PERSONAL_ACCESS_TOKEN`. Una guarda en `tests/workflows/ciInfrastructure.test.ts`
  hace fallar la build si alguna vez se introduce uno.

## Desarrollo local

Ejecutar `npm ci` en `website/server` en local tropieza con los mismos dos
obstáculos. Autentícate una vez con la CLI de GitHub y aplica el mismo reescrito
SSH:

```bash
gh auth login
gh auth setup-git
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
```

`gh auth setup-git` apunta git a un credential helper, y la regla `insteadOf` hace
que la descarga SSH de npm aterrice en HTTPS, de modo que el helper llega a ser
consultado.

## Requisito de versión de npm

Estos jobs instalan **npm 11.4.0** antes de `npm ci`:

```bash
npm install -g npm@11.4.0
```

npm 12 no es capaz de preparar la dependencia git `github:` en este repositorio.
Su proceso hijo `prepare` vuelve a leer `.npmrc`, donde `min-release-age=7` choca
con el flag `--before` del propio npm. Definir `npm_config_min_release_age=0` no
ayuda, porque `0` sigue contando como "proporcionado". npm 11.4.0 es anterior al
flag. `website/server/Dockerfile` fija la misma versión por el mismo motivo.

## Construcción de la imagen del servidor web

CI no construye `website/server/Dockerfile`, de modo que la construcción de la
imagen no dispone de credenciales. Si esa imagen se incorporara alguna vez a una
tubería, la descarga fallaría por los motivos anteriores y la build necesitaría
el token transmitido mediante un secreto de BuildKit: no copies la configuración
de git de tiempo `RUN` a un `Dockerfile`, o el token quedaría registrado en una
capa.

## Verificación del cambio

El cableado del workflow está cubierto por guardas:

```bash
npx vitest run tests/workflows/
```

Comprueban que los tres jobs llevan el reescrito SSH, la descarga HTTPS
autenticada y el token automático, y que no se ha colado ningún secreto de token
manual.

Para reproducir la ruta de credenciales de extremo a extremo:

```bash
gh auth token > /dev/null   # confirma que la CLI tiene una credencial utilizable
cd website/server
npm ci
```

## Diagnóstico de problemas

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `Permission denied (publickey)` | npm resolvió la dependencia por SSH | Aplica el reescrito `insteadOf` |
| `could not read Username for 'https://github.com'` | descarga anónima rechazada | Proporciona un token (CI) o `gh auth setup-git` (local) |
| `repository ... not found` en un repo visible | la cuenta no es legible de forma anónima | Igual que el caso anterior; la descarga autenticada sigue funcionando |
| Conflicto `--before` / `min-release-age` de npm | se está usando npm 12 | Instala antes npm 11.4.0 |
| `repomix resolves to ... instead of the local build` | el alias posterior a la instalación no surtió efecto | Consulta la verificación del alias en `ci-website.yml` |