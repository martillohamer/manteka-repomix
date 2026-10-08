# CUSTOM_PREP — Puntos de extensión para personalización de "Manteka Repomix"

Este documento identifica los puntos de entrada principales del código fuente que se modificarán próximamente para las personalizaciones propias de "Manteka Repomix". Sirve como mapa técnico para la Fase 5.

## 1. Metadatos del paquete (`package.json`)

| Campo | Valor actual | Personalización propuesta |
| --- | --- | --- |
| `name` | `repomix` | `manteka-repomix` |
| `version` | `1.18.1` | Mantener (versionado semántico propio) |
| `description` | `A tool to pack repository contents to single file for AI consumption` | Descripción de Manteka Repomix |
| `author` | `Kazuki Yamada <koukun0120@gmail.com>` | Manteka / Sergio |
| `homepage` | `https://github.com/yamadashy/repomix` | URL del fork |
| `repository.url` | `git://github.com/yamadashy/repomix.git` | URL del fork |
| `bugs.url` | `https://github.com/yamadashy/repomix/issues` | URL de issues del fork |
| `mcpName` | `io.github.yamadashy/repomix` | `io.github.DAW1BSergiomg26/manteka-repomix` |

**Archivo:** `package.json` (líneas 1-70)

## 2. Saludo de la CLI (`src/cli/cliRun.ts`)

```typescript
// Línea 393 — saludo al iniciar la CLI
logger.log(pc.dim(`\n📦 Repomix v${version}\n`));
```

**Personalización:** Cambiar `Repomix` por `Manteka Repomix` y ajustar el emoji/formato.

**Archivo:** `src/cli/cliRun.ts:393`

## 3. Descripción de la CLI (`src/cli/cliRun.ts`)

```typescript
// Línea 54 — Descripción del programa
.description('Repomix - Pack your repository into a single AI-friendly file')
```

**Personalización:** Actualizar la descripción para Manteka Repomix.

**Archivo:** `src/cli/cliRun.ts:54`

## 4. Acción de versión (`src/cli/actions/versionAction.ts`)

```typescript
export const runVersionAction = async (): Promise<void> => {
  const version = await getVersion();
  logger.log(version);
};
```

**Personalización:** Mostrar `Manteka Repomix v${version}` en lugar de solo el número.

**Archivo:** `src/cli/actions/versionAction.ts` (archivo completo, 7 líneas)

## 5. Cabecera de salida (`src/core/output/outputStyleDecorate.ts`)

```typescript
// Línea 98 — Texto de cabecera del archivo generado
return `${description}, combined into a single document by Repomix.\n${processingInfo}`.trim();
```

**Personalización:** Cambiar `Repomix` por `Manteka Repomix` en la cabecera del output.

**Archivo:** `src/core/output/outputStyleDecorate.ts:98`

## 6. Plantillas de salida (`src/core/output/outputStyles/`)

| Archivo | Uso | Personalización |
| --- | --- | --- |
| `xmlStyle.ts` | Output XML (default) | Cabecera, estructura de secciones |
| `markdownStyle.ts` | Output Markdown | Cabecera, estructura de secciones |
| `plainStyle.ts` | Output texto plano | Cabecera, estructura de secciones |

**Personalización:** Ajustar las cabeceras y textos de las plantillas para incluir branding de Manteka Repomix.

**Archivos:**
- `src/core/output/outputStyles/xmlStyle.ts` (89 líneas)
- `src/core/output/outputStyles/markdownStyle.ts`
- `src/core/output/outputStyles/plainStyle.ts`

## 7. Constantes de URLs (`src/shared/constants.ts`)

```typescript
export const REPOMIX_GITHUB_URL = 'https://github.com/yamadashy/repomix';
export const REPOMIX_ISSUES_URL = `${REPOMIX_GITHUB_URL}/issues`;
export const REPOMIX_DISCORD_URL = 'https://discord.gg/wNYzTwZFku';
```

**Personalización:** Actualizar las URLs al fork de Manteka.

**Archivo:** `src/shared/constants.ts` (3 líneas)

## 8. Servidor MCP (`src/mcp/mcpServer.ts`)

El servidor MCP se registra con un nombre y descripción que aparecen en los clientes de IA.

**Personalización:** Actualizar el nombre del servidor MCP y su descripción.

**Archivo:** `src/mcp/mcpServer.ts`

## 9. Lectura de versión (`src/core/file/packageJsonParse.ts`)

```typescript
export const getVersion = async (): Promise<string> => {
  // ...lee package.json y retorna version
};
```

**Nota:** No requiere cambios para personalización, pero es el punto donde se obtiene la versión que se muestra en el saludo de la CLI.

**Archivo:** `src/core/file/packageJsonParse.ts` (31 líneas)

## Resumen de archivos a modificar en Fase 5

| # | Archivo | Líneas aprox. | Cambio |
| --- | --- | --- | --- |
| 1 | `package.json` | 10 | Metadatos del paquete |
| 2 | `src/cli/cliRun.ts` | 2 | Saludo + descripción CLI |
| 3 | `src/cli/actions/versionAction.ts` | 1 | Acción de versión |
| 4 | `src/core/output/outputStyleDecorate.ts` | 1 | Cabecera de salida |
| 5 | `src/core/output/outputStyles/xmlStyle.ts` | 5 | Plantilla XML |
| 6 | `src/core/output/outputStyles/markdownStyle.ts` | 5 | Plantilla Markdown |
| 7 | `src/core/output/outputStyles/plainStyle.ts` | 5 | Plantilla plain |
| 8 | `src/shared/constants.ts` | 3 | URLs |
| 9 | `src/mcp/mcpServer.ts` | 3 | Servidor MCP |

**Total estimado:** ~35 líneas de cambio en 9 archivos.

## Consideraciones

- Todos los cambios son de **texto/branding**, no de lógica. No debería romper tests existentes.
- Los tests de `outputStyleDecorate.ts` verifican el texto de la cabecera. Si se cambia `Repomix` por `Manteka Repomix`, habrá que actualizar los tests correspondientes.
- El `package.json` es leído por `packageJsonParse.ts` para obtener la versión. Si se cambia `name`, el saludo de la CLI seguirá funcionando (lee `version`, no `name`).
- Las plantillas de salida usan Handlebars. Los cambios de texto no afectan la estructura del template.
