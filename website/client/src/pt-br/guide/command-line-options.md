---
title: "Opções de Linha de Comando"
description: "Consulte todas as opções da CLI do Repomix para entrada, saída, seleção de arquivos, repositórios remotos, configuração, segurança, contagem de tokens, MCP e agent skills."
---

# Opções de Linha de Comando

## Opções Básicas
- `-v, --version`: Mostrar versão da ferramenta

## Opções de Entrada/Saída CLI

| Opção | Descrição |
|-------|-----------|
| `--verbose` | Habilitar registro detalhado de depuração (mostra processamento de arquivos, contagem de tokens e detalhes de configuração) |
| `--quiet` | Suprimir toda saída do console exceto erros (útil para scripting) |
| `--stdout` | Escrever saída empacotada diretamente para stdout em vez de um arquivo (suprime todo o registro) |
| `--stdin` | Ler caminhos de arquivos do stdin, um por linha (os arquivos especificados são processados diretamente) |
| `--copy` | Copiar a saída gerada para a área de transferência do sistema após o processamento |
| `--token-count-tree [threshold]` | Exibir árvore de arquivos com contagem de tokens; limite opcional para mostrar apenas arquivos com ≥N tokens (ex: `--token-count-tree 100`) |
| `--top-files-len <number>` | Número dos maiores arquivos para exibir no resumo (padrão: `5`) |

## Opções de Saída do Repomix

| Opção | Descrição |
|-------|-----------|
| `-o, --output <file>` | Caminho do arquivo de saída (padrão: `repomix-output.xml`, usar `"-"` para stdout) |
| `--style <style>` | Formato de saída: `xml`, `markdown`, `json` ou `plain` (padrão: `xml`) |
| `--output-file-path-style <style>` | Como os caminhos de arquivo são exibidos na saída: `target-relative` ou `cwd-relative` (padrão: `target-relative`) |
| `--parsable-style` | Escapar caracteres especiais para garantir XML/Markdown válido (necessário quando a saída contém código que quebra a formatação) |
| `--compress` | Extrair a estrutura essencial do código (classes, funções, interfaces) usando análise Tree-sitter |
| `--output-show-line-numbers` | Adicionar número de linha a cada linha na saída |
| `--no-file-summary` | Omitir a seção de resumo de arquivos da saída |
| `--no-directory-structure` | Omitir a visualização da árvore de diretórios da saída |
| `--no-files` | Gerar apenas metadados sem conteúdo de arquivos (útil para análise de repositório) |
| `--remove-comments` | Remover todos os comentários do código antes de empacotar |
| `--remove-empty-lines` | Remover linhas em branco de todos os arquivos |
| `--truncate-base64` | Truncar strings longas de dados base64 para reduzir o tamanho da saída |
| `--header-text <text>` | Texto personalizado para incluir no início da saída |
| `--instruction-file-path <path>` | Caminho para um arquivo contendo instruções personalizadas para incluir na saída |
| `--split-output <size>` | Dividir saída em múltiplos arquivos numerados (ex: `repomix-output.1.xml`); tamanho como `500kb`, `2mb` ou `1.5mb` |
| `--include-empty-directories` | Incluir pastas sem arquivos na estrutura de diretórios |
| `--include-full-directory-structure` | Mostrar a árvore completa do repositório na seção Estrutura de Diretórios, mesmo ao usar padrões `--include` |
| `--no-git-sort-by-changes` | Não ordenar arquivos por frequência de mudanças no git (padrão: arquivos mais modificados primeiro) |
| `--include-diffs` | Adicionar seção de git diff mostrando mudanças da árvore de trabalho e mudanças em stage |
| `--include-logs` | Adicionar histórico de commits do git com mensagens e arquivos modificados |
| `--include-logs-count <count>` | Número de commits recentes para incluir com `--include-logs` (padrão: `50`) |

## Opções de Seleção de Arquivos

| Opção | Descrição |
|-------|-----------|
| `--include <patterns>` | Incluir apenas arquivos correspondentes a estes padrões glob (separados por vírgula, ex: `"src/**/*.js,*.md"`) |
| `-i, --ignore <patterns>` | Padrões adicionais para excluir (separados por vírgula, ex: `"*.test.js,docs/**"`) |
| `--no-gitignore` | Não usar regras `.gitignore` para filtrar arquivos |
| `--no-dot-ignore` | Não usar regras `.ignore` para filtrar arquivos |
| `--no-default-patterns` | Não aplicar padrões de exclusão integrados (`node_modules`, `.git`, diretórios de build, etc.) |

## Opções de Repositório Remoto

| Opção | Descrição |
|-------|-----------|
| `--remote <url>` | Clonar e empacotar um repositório remoto (URL do GitHub ou formato `user/repo`) |
| `--remote-branch <name>` | Branch, tag ou commit específico a usar (padrão: branch padrão do repositório) |
| `--remote-trust-config` | Confiar e carregar arquivos de configuração de repositórios remotos. Uma configuração confiável pode executar comandos e ler arquivos locais, então use-a apenas para repositórios em que você confia totalmente (desabilitado por padrão por segurança). Em um terminal interativo, a configuração é exibida e uma confirmação é solicitada |

## Opções de Configuração

| Opção | Descrição |
|-------|-----------|
| `-c, --config <path>` | Usar arquivo de configuração personalizado em vez de `repomix.config.json` |
| `--init` | Criar um novo arquivo `repomix.config.json` com valores padrão |
| `--global` | Com `--init`, criar configuração no diretório home em vez do diretório atual |

## Opções de Segurança
- `--no-security-check`: Pular verificação de dados sensíveis como chaves de API e senhas

## Opções de Contagem de Tokens
- `--token-count-encoding <encoding>`: Modelo tokenizador para contagem: o200k_base (GPT-4o), cl100k_base (GPT-3.5/4), etc. (padrão: o200k_base)
- `--token-budget <number>`: Falhar com código de saída diferente de zero quando a saída empacotada exceder N tokens. Útil como proteção em pipelines de CI e fluxos de trabalho de agentes para manter a saída dentro da janela de contexto do modelo de destino. A saída ainda é gerada; apenas o código de saída sinaliza o estouro.

## Opções MCP
- `--mcp`: Executar como servidor Model Context Protocol para integração de ferramentas de IA
- `--sandbox [dir]`: (com `--mcp`) Restringe as ferramentas de arquivo do servidor MCP a um diretório de workspace (padrão: diretório de trabalho; ex: `--sandbox path/to/project`). Todo caminho é relativo a essa raiz, caminhos absolutos/do host são recusados, e o empacotamento remoto, a geração de skills e o anexo de saídas externas são desabilitados. Veja [Servidor MCP](/pt-br/guide/mcp-server)

## Opções de Geração de Agent Skills

| Opção | Descrição |
|-------|-----------|
| `--skill-generate [name]` | Gerar saída no formato Claude Agent Skills no diretório `.claude/skills/<name>/` (nome gerado automaticamente se omitido) |
| `--skill-project-name <name>` | Substituir o nome do projeto usado nas descrições de Skills geradas |
| `--skill-output <path>` | Especificar o caminho do diretório de saída de skills diretamente (pula o prompt de local) |
| `-f, --force` | Pular todos os prompts de confirmação (sobrescrita do diretório de skills, confiança na configuração remota) |

## Opções do modo de observação

- `-w, --watch`: Observa alterações nos arquivos e reempacota automaticamente. Arquivos novos, alterados e excluídos são detectados, alterações rápidas sofrem debounce (300 ms) e um timestamp é impresso após cada reconstrução. Pressione `Ctrl+C` para parar.

O modo de observação só funciona com diretórios locais, portanto não pode ser combinado com `--remote`, uma URL de repositório remoto passada como argumento posicional, `--stdout`, `--stdin`, `--split-output`, `--skill-generate` ou `--copy`. Essas restrições se aplicam tanto se a opção for definida na linha de comando quanto no seu arquivo de configuração.

## Comandos de Termodinâmica e Evolução

O Repomix acompanha dois comandos de análise que leem o histórico Git do seu repositório e relatam em que pontos o código está sob pressão. Em relação à sua árvore de trabalho, ambos são somente leitura: `heat` nunca escreve nada, e `evolve` faz todo o seu trabalho em worktrees Git descartáveis sob o seu diretório temporário, deixando suas branches, seu HEAD e seus arquivos não commitados intactos.

### heat

Mede a "temperatura" de cada arquivo a partir da rotatividade de commits, da contagem de autores, do tamanho do arquivo e da densidade ciclomática, e então lista como *em ebulição* os arquivos que atingem ou superam o limite.

```bash
# Analyse the last 90 days of history
repomix heat .

# Widen the window and the report size
repomix heat . --days 365 --limit 50

# Machine-readable output
repomix heat . --json
```

| Opção | Padrão | Descrição |
| --- | --- | --- |
| `--days <n>` | `90` | Dias de histórico Git a analisar |
| `--max-commits <n>` | `500` | Número máximo de commits a analisar |
| `--t-max <n>` | `80` | Limiar de temperatura para arquivos em ebulição |
| `--limit <n>` | `20` | Número de arquivos listados na tabela |
| `--json` | off | Emitir o relatório bruto em vez de uma tabela |
| `--no-fail` | off | Sair com código `0` mesmo quando houver arquivos em ebulição |
| `--report` | off | Gravar `thermodynamic-report.json` em `.manteka-memory/` |

### evolve

Cria branches do seu repositório que contêm mutantes efêmeros, aplica mutações nos arquivos em ebulição e classifica os mutantes por um Índice de Aptidão Biológica. Cada mutante é avaliado em seu próprio worktree Git destacado, portanto o seu repositório nunca é modificado.

```bash
# Explore five mutants from the current HEAD
repomix evolve .

# Restrict to one operator and two files
repomix evolve . --operator dead-guard --target src/legacy.ts

# Include the project's own test suite in the score
repomix evolve . --run-tests
```

| Opção | Padrão | Descrição |
| --- | --- | --- |
| `--population <n>` | `5` | Número máximo de mutantes a avaliar |
| `--operator <name>` | todos os três | Restringir a um único operador; pode ser repetido |
| `--target <path>` | arquivos em ebulição | Restringir a arquivos específicos; pode ser repetido |
| `--concurrency <n>` | `2` | Mutantes avaliados em paralelo |
| `--run-tests` | off | Incluir o eixo de testes no índice de aptidão |
| `--test-timeout <ms>` | `300000` | Tempo limite da suíte de testes de cada mutante |
| `--json` | off | Emitir o relatório bruto em vez de uma tabela |
| `--report` | off | Gravar `evolution-report.json` em `.manteka-memory/` |

`--target` restringe o escopo, não o amplia: os alvos são intersectados com o conjunto em ebulição, portanto indicar um arquivo que não está em ebulição não produz mutantes para ele.

**Semântica da classificação.** Todos os três operadores de mutação adicionam código, o que eleva ligeiramente a temperatura. Por isso, cada mutante pontua um pouco pior que a linha de base não modificada, e a classificação significa **primeiro o menos prejudicial**, e não a maior melhora. Interprete a tabela dessa forma até que operadores de resfriamento cheguem em uma versão futura.

::: warning Executando sua suíte de testes
`--run-tests` executa o script `test` do seu próprio projeto uma vez por mutante, sobre o código já mutado. Isso significa executar código arbitrário do projeto contra uma entrada modificada. Deixe-o desativado, a menos que você realmente pretenda executá-lo, e espere que ele seja lento.
:::

## Recursos relacionados

- [Configuração](/pt-br/guide/configuration) - Definir opções no arquivo de configuração em vez de flags CLI
- [Formatos de Saída](/pt-br/guide/output) - Detalhes sobre formatos XML, Markdown, JSON e texto simples
- [Compressão de Código](/pt-br/guide/code-compress) - Como `--compress` funciona com Tree-sitter
- [Segurança](/pt-br/guide/security) - O que `--no-security-check` desativa

## Exemplos

```bash
# Uso básico
repomix

# Arquivo de saída e formato personalizados
repomix -o my-output.xml --style xml

# Saída para stdout
repomix --stdout > custom-output.txt

# Saída para stdout, depois pipe para outro comando (ex., simonw/llm)
repomix --stdout | llm "Por favor explique o que este código faz."

# Saída personalizada com compressão
repomix --compress

# Processar arquivos específicos com padrões
repomix --include "src/**/*.ts,*.md" --ignore "*.test.js,docs/**"

# Repositório remoto com branch
repomix --remote https://github.com/user/repo/tree/main

# Repositório remoto com commit
repomix --remote https://github.com/user/repo/commit/836abcd7335137228ad77feb28655d85712680f1

# Repositório remoto com forma abreviada
repomix --remote user/repo

# Repositório remoto com forma abreviada (detectado automaticamente, sem --remote)
repomix user/repo

# Lista de arquivos usando stdin
find src -name "*.ts" -type f | repomix --stdin
git ls-files "*.js" | repomix --stdin
echo -e "src/index.ts\nsrc/utils.ts" | repomix --stdin

# Integração Git
repomix --include-diffs  # Incluir diffs do git para mudanças não commitadas
repomix --include-logs   # Incluir logs do git (últimos 50 commits por padrão)
repomix --include-logs --include-logs-count 10  # Incluir últimos 10 commits
repomix --include-diffs --include-logs  # Incluir tanto diffs quanto logs

# Análise de contagem de tokens
repomix --token-count-tree
repomix --token-count-tree 1000  # Mostrar apenas arquivos/diretórios com 1000+ tokens

# Modo de observação: reempacotar automaticamente ao alterar arquivos
repomix --watch
repomix -w --include "src/**/*.ts"
```

