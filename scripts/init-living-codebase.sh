#!/bin/bash
# Inicializa la memoria local del "Living Codebase" (Manteka) en un repositorio.
#
# Crea el directorio .manteka-memory/ con un historial sembrado, una hoja de
# estado y un informe de salud vacio, y se asegura de que esa memoria siga
# siendo local anadiendo .manteka-memory/ a .gitignore.
#
# Uso:
#   ./scripts/init-living-codebase.sh                  # Inicializa el directorio actual
#   ./scripts/init-living-codebase.sh ruta/a/repos     # Inicializa otro repositorio
#   ./scripts/init-living-codebase.sh --threshold 500  # Cambia el umbral de lineas
#
# Seguridad: el script es idempotente y NUNCA trunca datos existentes. Al
# re-ejecutarlo sobre un repositorio ya inicializado, history.log,
# health-report.json y living-codebase-status.md se quedan intactos.
#
# Requisitos: bash 3.2+ (el de macOS vale) y coreutils. Sin dependencias extra.

set -euo pipefail

MEMORY_DIR_NAME='.manteka-memory'
LINE_THRESHOLD=400

# --- Color, respetuoso con NO_COLOR y con la redireccion de salida -------------
# https://no-color.org. Si stdout no es una terminal no emitimos secuencias de
# escape, para no ensuciar logs de CI ni la salida de un pipe.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != 'dumb' ]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_CYAN=$'\033[36m'
else
  C_RESET=''
  C_BOLD=''
  C_GREEN=''
  C_YELLOW=''
  C_CYAN=''
fi

info() { printf '%s\n' "$1"; }
step() { printf '  %s->%s %s\n' "$C_CYAN" "$C_RESET" "$1"; }
ok()   { printf '  %sOK%s   %s\n' "$C_GREEN" "$C_RESET" "$1"; }
skip() { printf '  %s--%s   %s\n' "$C_YELLOW" "$C_RESET" "$1"; }
die()  { printf '%sError:%s %s\n' "$C_BOLD" "$C_RESET" "$1" >&2; exit 1; }

# --- Timestamp ISO-8601, igual que el que escribe el servidor MCP ------------
# GNU date soporta %3N para milisegundos; el date de BSD/macOS no y escribiria
# un "3N" literal, asi que caemos a milisegundos en cero.
iso_timestamp() {
  local stamp
  stamp=$(date -u '+%Y-%m-%dT%H:%M:%S.%3NZ' 2>/dev/null) || stamp=''
  case "$stamp" in
    *'%3N'* | '') stamp=$(date -u '+%Y-%m-%dT%H:%M:%S.000Z') ;;
  esac
  printf '%s' "$stamp"
}

# Nombre del proyecto: raiz de git si estamos dentro de uno, si no la carpeta.
detect_project_name() {
  local root="$1" name=''
  if command -v git >/dev/null 2>&1 && git -C "$root" rev-parse --show-toplevel >/dev/null 2>&1; then
    name=$(basename "$(git -C "$root" rev-parse --show-toplevel 2>/dev/null)")
  fi
  if [ -z "$name" ] || [ "$name" = '.' ]; then
    name=$(basename "$(cd "$root" && pwd)")
  fi
  # El nombre acaba dentro de un JSON y de un .gitignore: lo reducimos a
  # caracteres seguros para no romper ni el JSON valido ni el fichero de texto.
  printf '%s' "$name" | tr -c 'A-Za-z0-9._-' '_'
}

# Stack deducido de los ficheros de manifesto presentes en la raiz.
detect_stack() {
  local root="$1" list=''

  add() {
    case "$list" in
      *", $1," | "$1," | ", $1" | "$1") return 0 ;;
    esac
    if [ -z "$list" ]; then list="$1"; else list="$list, $1"; fi
  }

  [ -f "$root/package.json" ] && add 'Node.js'
  [ -f "$root/tsconfig.json" ] && add 'TypeScript'
  if [ -f "$root/pyproject.toml" ] || [ -f "$root/requirements.txt" ]; then add 'Python'; fi
  [ -f "$root/go.mod" ] && add 'Go'
  [ -f "$root/Cargo.toml" ] && add 'Rust'
  if [ -f "$root/pom.xml" ] || [ -f "$root/build.gradle" ] || [ -f "$root/build.gradle.kts" ]; then
    add 'JVM'
  fi
  [ -f "$root/Gemfile" ] && add 'Ruby'
  [ -f "$root/composer.json" ] && add 'PHP'
  [ -f "$root/Dockerfile" ] && add 'Docker'
  [ -f "$root/docker-compose.yml" ] && add 'Docker Compose'

  printf '%s' "${list:-No detectado}"
}

# --- Plantillas ---------------------------------------------------------------
# Se escriben con heredoc citado (<<'EOF') para que los acentos graves y los
# signos $ del contenido jamas se interpreten, y despues se sustituyen los
# marcadores {{...}} con sed.
render_template() {
  local target="$1" timestamp="$2" name="$3" stack="$4" threshold="$5"

  sed -e "s|{{TIMESTAMP}}|$timestamp|g" \
      -e "s|{{NAME}}|$name|g" \
      -e "s|{{STACK}}|$stack|g" \
      -e "s|{{THRESHOLD}}|$threshold|g" \
      "$target"
}

usage() {
  cat <<'USAGE'
Inicializa la memoria local del Living Codebase (Manteka).

Uso:
  init-living-codebase.sh [opciones] [ruta]

Opciones:
  -t, --threshold N   Umbral de lineas por fichero (por defecto 400)
  -h, --help          Esta ayuda

Ejemplos:
  ./scripts/init-living-codebase.sh
  ./scripts/init-living-codebase.sh --threshold 500 ruta/a/repo
USAGE
}

# --- Argumentos ----------------------------------------------------------------
target='.'
while [ $# -gt 0 ]; do
  case "$1" in
    -t | --threshold)
      [ $# -ge 2 ] || die "--threshold necesita un valor"
      LINE_THRESHOLD="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --)
      shift
      [ $# -ge 1 ] && target="$1"
      break
      ;;
    -*)
      die "opcion desconocida: $1 (usa --help)"
      ;;
    *)
      target="$1"
      shift
      ;;
  esac
done

case "$LINE_THRESHOLD" in
  '' | *[!0-9]*) die "el umbral debe ser un numero entero: $LINE_THRESHOLD" ;;
esac
[ "$LINE_THRESHOLD" -gt 0 ] || die 'el umbral debe ser mayor que cero'

[ -d "$target" ] || die "el directorio objetivo no existe: $target"
ROOT=$(cd "$target" && pwd)
MEMORY_DIR="$ROOT/$MEMORY_DIR_NAME"

if [ -e "$MEMORY_DIR" ] && [ ! -d "$MEMORY_DIR" ]; then
  die "$MEMORY_DIR_NAME ya existe pero no es un directorio"
fi

PROJECT_NAME=$(detect_project_name "$ROOT")
STACK=$(detect_stack "$ROOT")
TIMESTAMP=$(iso_timestamp)

printf '\n%sLiving Codebase%s - inicializacion en %s\n' \
  "$C_BOLD$C_CYAN" "$C_RESET" "$ROOT"
info "${C_BOLD}Proyecto${C_RESET}"
info "  Nombre:  $PROJECT_NAME"
info "  Stack:   $STACK"
info "  Umbral:  $LINE_THRESHOLD lineas por fichero"
info "  Momento: $TIMESTAMP"
printf '\n'

# --- 1. Directorio de memoria local --------------------------------------------
if [ -d "$MEMORY_DIR" ]; then
  skip "$MEMORY_DIR_NAME/ ya existe (se conserva)"
else
  mkdir -p "$MEMORY_DIR"
  ok "creado $MEMORY_DIR_NAME/"
fi

# --- 2. Ficheros base ----------------------------------------------------------
HISTORY_FILE="$MEMORY_DIR/history.log"
if [ -e "$HISTORY_FILE" ]; then
  skip "history.log ya existe (se conserva, no se trunca)"
else
  printf '[%s] [milestone] Living Codebase inicializado en %s: memoria local creada, umbral de code smell %s lineas. Primer registro; usa la herramienta manteka_analyze_code_health para generar el informe real de salud. (file: %s)\n' \
    "$TIMESTAMP" "$PROJECT_NAME" "$LINE_THRESHOLD" "$MEMORY_DIR_NAME" > "$HISTORY_FILE"
  ok 'creado history.log con la entrada milestone inicial'
fi

STATUS_FILE="$MEMORY_DIR/living-codebase-status.md"
if [ -e "$STATUS_FILE" ]; then
  skip 'living-codebase-status.md ya existe (se conserva)'
else
  cat > "$STATUS_FILE" <<'STATUS_EOF'
# Living Codebase - Estado inicial

## Proyecto

| Campo | Valor |
|---|---|
| Nombre | {{NAME}} |
| Stack | {{STACK}} |
| Umbral de codigo | {{THRESHOLD}} lineas por fichero |
| Inicializado | {{TIMESTAMP}} |

## Estado

Memoria local inicializada. La sesion de prediccion y el informe de salud
aun no contienen datos reales: se rellenan con el uso de las herramientas
Manteka.

## Salud del codigo

Sin analizar. Ejecuta la herramienta `manteka_analyze_code_health` para
generar un informe real en `health-report.json`.

## Ficheros

- `history.log` - bitacora en formato `[timestamp] [categoria] mensaje (file: ruta)`
- `health-report.json` - ultimo informe de salud del codigo
- `living-codebase-status.md` - este documento

## Limites conocidos

- La memoria es local y deliberadamente **no** se versiona: esta en `.gitignore`
  para no filtrar notas ni auditoria a un repositorio remoto.
- El analisis de salud mide **tamano de fichero**; no detecta dependencias
  obsoletas ni duplicacion real.
- La prediccion de sesion mejora con historial sembrado. Con la memoria vacia
  devuelve `confidenceScore` 0.5 por defecto.
STATUS_EOF
  render_template "$STATUS_FILE" "$TIMESTAMP" "$PROJECT_NAME" "$STACK" "$LINE_THRESHOLD" \
    > "$STATUS_FILE.tmp"
  mv "$STATUS_FILE.tmp" "$STATUS_FILE"
  ok 'creado living-codebase-status.md'
fi

REPORT_FILE="$MEMORY_DIR/health-report.json"
if [ -e "$REPORT_FILE" ]; then
  skip 'health-report.json ya existe (se conserva)'
else
  cat > "$REPORT_FILE" <<'JSON_EOF'
{
  "timestamp": "{{TIMESTAMP}}",
  "totalSmells": 0,
  "codeSmells": [],
  "sessionPrediction": {
    "recommendedFiles": [],
    "primaryFocus": "General Maintenance",
    "recentActivitySummary": "Memoria recien inicializada, sin historial.",
    "confidenceScore": 0.5
  }
}
JSON_EOF
  render_template "$REPORT_FILE" "$TIMESTAMP" "$PROJECT_NAME" "$STACK" "$LINE_THRESHOLD" \
    > "$REPORT_FILE.tmp"
  mv "$REPORT_FILE.tmp" "$REPORT_FILE"
  ok 'creado health-report.json (estructura base, 0 smells)'
fi

# --- 3. Gestion de .gitignore ---------------------------------------------------
GITIGNORE="$ROOT/.gitignore"
if [ ! -e "$GITIGNORE" ]; then
  printf '# Creado por init-living-codebase.sh\n' > "$GITIGNORE"
  ok 'creado .gitignore (no existia)'
fi

# Tolerante a las variantes que la gente escribe a mano: con o sin barra
# inicial, con o sin barra final, y con espacios alrededor.
if grep -Eq '^[[:space:]]*/?'"$MEMORY_DIR_NAME"'/?[[:space:]]*$' "$GITIGNORE"; then
  skip ".gitignore ya excluye $MEMORY_DIR_NAME/"
else
  # Si el fichero no termina en newline, anadimos uno antes de anexar, para no
  # pegarle la regla a la ultima linea existente.
  if [ -s "$GITIGNORE" ] && [ "$(tail -c 1 "$GITIGNORE" | wc -l | tr -d ' ')" -eq 0 ]; then
    printf '\n' >> "$GITIGNORE"
  fi
  printf '\n# Manteka local memory (notas, history.log, health-report.json): privado, nunca versionar\n%s/\n' \
    "$MEMORY_DIR_NAME" >> "$GITIGNORE"
  ok "anadida la regla $MEMORY_DIR_NAME/ a .gitignore"
fi

# --- 4. Comprobacion final -----------------------------------------------------
printf '\n'
if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  if git -C "$ROOT" check-ignore -q "$MEMORY_DIR_NAME" 2>/dev/null; then
    ok "verificado con git check-ignore: $MEMORY_DIR_NAME/ esta ignorado"
  else
    skip "aviso: git no reporta $MEMORY_DIR_NAME/ como ignorado; revisa .gitignore"
  fi
fi

info ''
printf '%sLiving Codebase inicializado correctamente.%s' "$C_GREEN$C_BOLD" "$C_RESET"
info "  $MEMORY_DIR_NAME/  ->  historial, estado e informe de salud"
info "  Umbral de codigo: $LINE_THRESHOLD lineas"
printf '\n'

cat <<'EOF'
Siguientes pasos sugeridos (herramientas MCP de Manteka):
  1. Analiza la salud del codigo:   manteka_analyze_code_health
  2. Registra un hito o decision:    manteka_log_history
  3. Reconstruye el por que de un    manteka_semantic_debug
     cambio pasado cruzando el
     historial, las notas y el informe

Nota: la memoria es local y NO se versiona, por diseño y por privacidad.
EOF
