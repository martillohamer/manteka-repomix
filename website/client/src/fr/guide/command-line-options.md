---
title: "Options de ligne de commande"
description: "Consultez toutes les options de la CLI Repomix pour l'entrée, la sortie, la sélection de fichiers, les dépôts distants, la configuration, la sécurité, le comptage des tokens, MCP et les Agent Skills."
---

# Options de ligne de commande

## Options de base
- `-v, --version`: Afficher la version de l'outil

## Options d'entrée/sortie CLI

| Option | Description |
|--------|-------------|
| `--verbose` | Activer la journalisation de débogage détaillée (affiche le traitement des fichiers, les comptages de jetons et les détails de configuration) |
| `--quiet` | Supprimer toute sortie console sauf les erreurs (utile pour les scripts) |
| `--stdout` | Écrire la sortie empaquetée directement vers stdout au lieu d'un fichier (supprime toute journalisation) |
| `--stdin` | Lire les chemins de fichiers depuis stdin, un par ligne (les fichiers spécifiés sont traités directement) |
| `--copy` | Copier la sortie générée dans le presse-papiers système après le traitement |
| `--token-count-tree [threshold]` | Afficher l'arbre des fichiers avec les comptages de jetons ; seuil optionnel pour n'afficher que les fichiers avec au moins N jetons (ex : `--token-count-tree 100`) |
| `--top-files-len <number>` | Nombre des plus gros fichiers à afficher dans le résumé (par défaut : `5`) |

## Options de sortie Repomix

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Chemin du fichier de sortie (par défaut : `repomix-output.xml`, utiliser `"-"` pour stdout) |
| `--style <style>` | Format de sortie : `xml`, `markdown`, `json` ou `plain` (par défaut : `xml`) |
| `--output-file-path-style <style>` | Façon dont les chemins de fichiers sont affichés dans la sortie : `target-relative` ou `cwd-relative` (par défaut : `target-relative`) |
| `--parsable-style` | Échapper les caractères spéciaux pour assurer un XML/Markdown valide (nécessaire lorsque la sortie contient du code qui casse le formatage) |
| `--compress` | Extraire la structure essentielle du code (classes, fonctions, interfaces) via l'analyse Tree-sitter |
| `--output-show-line-numbers` | Préfixer chaque ligne avec son numéro de ligne dans la sortie |
| `--no-file-summary` | Omettre la section de résumé des fichiers de la sortie |
| `--no-directory-structure` | Omettre la visualisation de l'arborescence des répertoires de la sortie |
| `--no-files` | Générer uniquement les métadonnées sans le contenu des fichiers (utile pour l'analyse de dépôt) |
| `--remove-comments` | Supprimer tous les commentaires de code avant l'empaquetage |
| `--remove-empty-lines` | Supprimer les lignes vides de tous les fichiers |
| `--truncate-base64` | Tronquer les longues chaînes de données base64 pour réduire la taille de la sortie |
| `--header-text <text>` | Texte personnalisé à inclure au début de la sortie |
| `--instruction-file-path <path>` | Chemin vers un fichier contenant des instructions personnalisées à inclure dans la sortie |
| `--split-output <size>` | Diviser la sortie en plusieurs fichiers numérotés (p. ex. `repomix-output.1.xml`) ; taille comme `500kb`, `2mb` ou `1.5mb` |
| `--include-empty-directories` | Inclure les dossiers sans fichiers dans la structure de répertoires |
| `--include-full-directory-structure` | Afficher l'arborescence complète du dépôt dans la section Structure de répertoire, même lors de l'utilisation de motifs `--include` |
| `--no-git-sort-by-changes` | Ne pas trier les fichiers par fréquence de modifications git (par défaut : fichiers les plus modifiés en premier) |
| `--include-diffs` | Ajouter une section diff git montrant les modifications de l'arbre de travail et les modifications indexées |
| `--include-logs` | Ajouter l'historique des commits git avec les messages et les fichiers modifiés |
| `--include-logs-count <count>` | Nombre de commits récents à inclure avec `--include-logs` (par défaut : `50`) |

## Options de sélection de fichiers

| Option | Description |
|--------|-------------|
| `--include <patterns>` | Inclure uniquement les fichiers correspondant à ces motifs glob (séparés par des virgules, ex : `"src/**/*.js,*.md"`) |
| `-i, --ignore <patterns>` | Motifs supplémentaires à exclure (séparés par des virgules, ex : `"*.test.js,docs/**"`) |
| `--no-gitignore` | Ne pas utiliser les règles `.gitignore` pour filtrer les fichiers |
| `--no-dot-ignore` | Ne pas utiliser les règles `.ignore` pour filtrer les fichiers |
| `--no-default-patterns` | Ne pas appliquer les motifs d'exclusion intégrés (`node_modules`, `.git`, répertoires de build, etc.) |

## Options de dépôt distant

| Option | Description |
|--------|-------------|
| `--remote <url>` | Cloner et empaqueter un dépôt distant (URL GitHub ou format `user/repo`) |
| `--remote-branch <name>` | Branche, tag ou commit spécifique à utiliser (par défaut : branche par défaut du dépôt) |
| `--remote-trust-config` | Faire confiance et charger les fichiers de configuration des dépôts distants. Une configuration de confiance peut exécuter des commandes et lire des fichiers locaux ; n'utilisez cette option que pour des dépôts auxquels vous faites entièrement confiance (désactivé par défaut pour la sécurité). Dans un terminal interactif, la configuration est affichée et une confirmation est demandée |

## Options de configuration

| Option | Description |
|--------|-------------|
| `-c, --config <path>` | Utiliser un fichier de configuration personnalisé au lieu de `repomix.config.json` |
| `--init` | Créer un nouveau fichier `repomix.config.json` avec les valeurs par défaut |
| `--global` | Avec `--init`, créer la configuration dans le répertoire personnel au lieu du répertoire courant |

## Options de sécurité
- `--no-security-check`: Ignorer la recherche de données sensibles comme les clés API et mots de passe

## Options de comptage de jetons
- `--token-count-encoding <encoding>`: Modèle de tokenizer pour le comptage : o200k_base (GPT-4o), cl100k_base (GPT-3.5/4), etc. (par défaut : o200k_base)
- `--token-budget <number>`: Échouer avec un code de sortie non nul lorsque la sortie empaquetée dépasse N jetons. Utile comme garde-fou dans les pipelines CI et les workflows d'agents pour maintenir la sortie dans la fenêtre de contexte d'un modèle cible. La sortie est tout de même générée ; seul le code de sortie signale le dépassement.

## Options MCP
- `--mcp`: Fonctionner comme serveur Model Context Protocol pour l'intégration d'outils IA
- `--sandbox [dir]`: (avec `--mcp`) Confiner les outils de fichiers du serveur MCP à un répertoire de travail (par défaut le répertoire courant ; ex : `--sandbox path/to/project`). Chaque chemin est relatif à cette racine, les chemins absolus/de l'hôte sont refusés, et l'empaquetage de dépôts distants, la génération de skills et l'attachement de sorties externes sont désactivés. Voir [Serveur MCP](/fr/guide/mcp-server).

## Options de génération d'Agent Skills

| Option | Description |
|--------|-------------|
| `--skill-generate [name]` | Générer une sortie au format Claude Agent Skills dans le répertoire `.claude/skills/<name>/` (nom auto-généré si omis) |
| `--skill-project-name <name>` | Remplacer le nom du projet utilisé dans les descriptions des Skills générées |
| `--skill-output <path>` | Spécifier directement le chemin du répertoire de sortie des skills (ignore l'invite d'emplacement) |
| `-f, --force` | Ignorer toutes les invites de confirmation (remplacement du répertoire de skills, confiance accordée à la configuration distante) |

## Options du mode surveillance

- `-w, --watch`: Surveille les modifications de fichiers et reconditionne automatiquement. Les fichiers ajoutés, modifiés et supprimés sont détectés, les changements rapides sont regroupés (debounce de 300 ms), et un horodatage est affiché après chaque reconstruction. Appuyez sur `Ctrl+C` pour arrêter.

Le mode surveillance ne fonctionne qu'avec des répertoires locaux ; il ne peut donc pas être combiné avec `--remote`, une URL de dépôt distant passée en argument positionnel, `--stdout`, `--stdin`, `--split-output`, `--skill-generate` ou `--copy`. Ces restrictions s'appliquent que l'option soit définie en ligne de commande ou dans votre fichier de configuration.

## Commandes de thermodynamique et d'évolution

Repomix fournit deux commandes d'analyse qui lisent l'historique Git de votre dépôt et signalent où le code est sous pression. Elles sont en lecture seule vis-à-vis de votre arbre de travail : `heat` n'écrit jamais rien, et `evolve` effectue tout son travail dans des worktrees Git jetables situés dans votre répertoire temporaire, laissant vos branches, votre HEAD et vos modifications non commitées intactes.

### heat

Mesure la « température » de chaque fichier à partir du brassage des commits, du nombre d'auteurs, de la taille du fichier et de la densité cyclomatique, puis liste comme *en ébullition* les fichiers qui atteignent ou dépassent le seuil.

```bash
# Analyse the last 90 days of history
repomix heat .

# Widen the window and the report size
repomix heat . --days 365 --limit 50

# Machine-readable output
repomix heat . --json
```

| Option | Par défaut | Description |
| --- | --- | --- |
| `--days <n>` | `90` | Jours d'historique Git à analyser |
| `--max-commits <n>` | `500` | Nombre maximal de commits à analyser |
| `--t-max <n>` | `80` | Seuil de température pour les fichiers en ébullition |
| `--limit <n>` | `20` | Nombre de fichiers listés dans le tableau |
| `--json` | désactivé | Émettre le rapport brut au lieu d'un tableau |
| `--no-fail` | désactivé | Quitter avec le code `0` même si des fichiers en ébullition sont détectés |
| `--report` | désactivé | Écrire `thermodynamic-report.json` dans `.manteka-memory/` |

### evolve

Crée des branches éphémères depuis votre dépôt, mute les fichiers en ébullition et classe les mutants selon un Biological Fitness Index. Chaque mutant est évalué dans son propre worktree Git détaché, de sorte que votre dépôt n'est jamais modifié.

```bash
# Explore five mutants from the current HEAD
repomix evolve .

# Restrict to one operator and two files
repomix evolve . --operator dead-guard --target src/legacy.ts

# Include the project's own test suite in the score
repomix evolve . --run-tests
```

| Option | Par défaut | Description |
| --- | --- | --- |
| `--population <n>` | `5` | Nombre maximal de mutants à évaluer |
| `--operator <name>` | les trois | Restreindre à un seul opérateur ; répétable |
| `--target <path>` | fichiers en ébullition | Restreindre à des fichiers spécifiques ; répétable |
| `--concurrency <n>` | `2` | Mutants évalués en parallèle |
| `--run-tests` | désactivé | Inclure l'axe de test dans l'indice de fitness |
| `--test-timeout <ms>` | `300000` | Délai d'expiration de la suite de tests par mutant |
| `--json` | désactivé | Émettre le rapport brut au lieu d'un tableau |
| `--report` | désactivé | Écrire `evolution-report.json` dans `.manteka-memory/` |

`--target` restreint la portée, il ne l'élargit pas : les cibles sont intersectées avec l'ensemble en ébullition, donc nommer un fichier qui n'est pas en ébullition ne produit aucun mutant pour ce fichier.

**Sémantique du classement.** Les trois opérateurs de mutation ajoutent du code, ce qui fait légèrement monter la température. Chaque mutant obtient donc un score à peine moins bon que la base de référence non modifiée, et le classement signifie **le moins nuisible d'abord**, et non la meilleure amélioration. Interprétez le tableau de cette manière tant que des opérateurs de refroidissement ne sont pas apparus dans une version ultérieure.

::: warning Exécution de votre suite de tests
`--run-tests` exécute le script `test` de votre projet une fois par mutant, sur du code source muté. Il s'agit de code arbitraire de votre projet exécuté contre des entrées modifiées. Laissez-le désactivé sauf si vous avez l'intention de l'exécuter, et attendez-vous à ce qu'il soit lent.
:::

## Ressources associées

- [Configuration](/fr/guide/configuration) - Définir les options dans le fichier de configuration au lieu des flags CLI
- [Formats de sortie](/fr/guide/output) - Détails sur XML, Markdown, JSON et texte brut
- [Compression de code](/fr/guide/code-compress) - Comment `--compress` fonctionne avec Tree-sitter
- [Sécurité](/fr/guide/security) - Ce que `--no-security-check` désactive

## Exemples

```bash
# Utilisation de base
repomix

# Fichier de sortie et format personnalisés
repomix -o my-output.xml --style xml

# Sortie vers stdout
repomix --stdout > custom-output.txt

# Sortie vers stdout, puis redirection vers une autre commande (par exemple, simonw/llm)
repomix --stdout | llm "Veuillez expliquer ce que fait ce code."

# Sortie personnalisée avec compression
repomix --compress

# Traiter des fichiers spécifiques avec des motifs
repomix --include "src/**/*.ts,*.md" --ignore "*.test.js,docs/**"

# Dépôt distant avec branche
repomix --remote https://github.com/user/repo/tree/main

# Dépôt distant avec commit
repomix --remote https://github.com/user/repo/commit/836abcd7335137228ad77feb28655d85712680f1

# Dépôt distant avec forme abrégée
repomix --remote user/repo

# Dépôt distant avec forme abrégée (détecté automatiquement, sans --remote)
repomix user/repo

# Liste de fichiers utilisant stdin
find src -name "*.ts" -type f | repomix --stdin
git ls-files "*.js" | repomix --stdin
echo -e "src/index.ts\nsrc/utils.ts" | repomix --stdin

# Intégration Git
repomix --include-diffs  # Inclure les diffs git pour les modifications non commitées
repomix --include-logs   # Inclure les journaux git (derniers 50 commits par défaut)
repomix --include-logs --include-logs-count 10  # Inclure les 10 derniers commits
repomix --include-diffs --include-logs  # Inclure à la fois les diffs et les journaux

# Analyse du comptage de jetons
repomix --token-count-tree
repomix --token-count-tree 1000  # Afficher uniquement les fichiers/répertoires avec 1000+ jetons

# Mode surveillance : reconditionnement automatique à chaque modification de fichier
repomix --watch
repomix -w --include "src/**/*.ts"
```

