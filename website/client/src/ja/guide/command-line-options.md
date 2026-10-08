---
title: コマンドラインオプション
description: 入力、出力、ファイル選択、リモートリポジトリ、設定、セキュリティ、トークン計測、MCP、Agent Skillsに関するRepomix CLIオプションを一覧できます。
---

# コマンドラインオプション

## 基本オプション
- `-v, --version`: バージョン情報を表示して終了

## CLI入出力オプション

| オプション | 説明 |
|-----------|------|
| `--verbose` | 詳細なデバッグログを有効化（ファイル処理、トークン数、設定詳細を表示） |
| `--quiet` | エラー以外のすべてのコンソール出力を抑制（スクリプト実行時に有用） |
| `--stdout` | パックした出力をファイルではなく標準出力に直接出力（すべてのログを抑制） |
| `--stdin` | Stdinから1行ずつファイルパスを読み取り（指定されたファイルを直接処理） |
| `--copy` | 処理後に生成された出力をシステムクリップボードにコピー |
| `--token-count-tree [threshold]` | トークン数付きファイルツリーを表示；オプションでN以上のトークンを持つファイルのみ表示（例：`--token-count-tree 100`） |
| `--top-files-len <number>` | サマリーに表示する最大ファイル数（デフォルト：`5`） |

## Repomix出力オプション

| オプション | 説明 |
|-----------|------|
| `-o, --output <file>` | 出力ファイルパス（デフォルト：`repomix-output.xml`、標準出力には`"-"`を使用） |
| `--style <style>` | 出力形式：`xml`、`markdown`、`json`、または`plain`（デフォルト：`xml`） |
| `--output-file-path-style <style>` | 出力内でのファイルパスの表示方法：`target-relative` または `cwd-relative`（デフォルト：`target-relative`） |
| `--parsable-style` | 特殊文字をエスケープして有効なXML/Markdownを保証（出力に形式を破損するコードが含まれる場合に必要） |
| `--compress` | Tree-sitter解析を使用して重要なコード構造（クラス、関数、インターフェース）を抽出 |
| `--output-show-line-numbers` | 出力の各行に行番号を付ける |
| `--no-file-summary` | 出力からファイルサマリーセクションを省略 |
| `--no-directory-structure` | 出力からディレクトリツリーの可視化を省略 |
| `--no-files` | ファイル内容なしでメタデータのみを生成（リポジトリ分析に有用） |
| `--remove-comments` | パック前にすべてのコードコメントを除去 |
| `--remove-empty-lines` | すべてのファイルから空行を削除 |
| `--truncate-base64` | 出力サイズを削減するため長いbase64データ文字列を切り詰め |
| `--header-text <text>` | 出力の冒頭に含めるカスタムテキスト |
| `--instruction-file-path <path>` | 出力に含めるカスタム指示を含むファイルのパス |
| `--split-output <size>` | 出力を複数の番号付きファイルに分割（例：`repomix-output.1.xml`）；`500kb`、`2mb`、`1.5mb`などのサイズ指定 |
| `--include-empty-directories` | ディレクトリ構造にファイルのないフォルダを含める |
| `--include-full-directory-structure` | `--include`パターンを使用する場合でも、ディレクトリ構造セクションにリポジトリ全体のツリーを表示 |
| `--no-git-sort-by-changes` | Git変更頻度によるファイルのソートをしない（デフォルト：最も変更の多いファイルを優先） |
| `--include-diffs` | ワークツリーとステージングされた変更を示すgit diffセクションを追加 |
| `--include-logs` | メッセージと変更されたファイルを含むgitコミット履歴を追加 |
| `--include-logs-count <count>` | `--include-logs`で含める最新のコミット数（デフォルト：`50`） |

## ファイル選択オプション

| オプション | 説明 |
|-----------|------|
| `--include <patterns>` | これらのglobパターンに一致するファイルのみを含める（カンマ区切り、例：`"src/**/*.js,*.md"`） |
| `-i, --ignore <patterns>` | 除外する追加パターン（カンマ区切り、例：`"*.test.js,docs/**"`） |
| `--no-gitignore` | ファイルフィルタリングに`.gitignore`ルールを使用しない |
| `--no-dot-ignore` | ファイルフィルタリングに`.ignore`ルールを使用しない |
| `--no-default-patterns` | 組み込みの無視パターンを適用しない（`node_modules`、`.git`、buildディレクトリなど） |

## リモートリポジトリオプション

| オプション | 説明 |
|-----------|------|
| `--remote <url>` | リモートリポジトリをクローンしてパック（GitHub URLまたは`user/repo`形式） |
| `--remote-branch <name>` | 使用する特定のブランチ、タグ、またはコミット（デフォルト：リポジトリのデフォルトブランチ） |
| `--remote-trust-config` | リモートリポジトリの設定ファイルを信頼してロードします。信頼した設定はコマンドを実行したりローカルファイルを読み取ったりできるため、完全に信頼できるリポジトリでのみ使用してください（セキュリティのためデフォルトで無効）。対話的なターミナルでは、設定内容を表示して確認を求めます |

## 設定オプション

| オプション | 説明 |
|-----------|------|
| `-c, --config <path>` | `repomix.config.json`の代わりにカスタム設定ファイルを使用 |
| `--init` | デフォルト設定で新しい`repomix.config.json`ファイルを作成 |
| `--global` | `--init`と併用、現在のディレクトリではなくホームディレクトリに設定を作成 |

## セキュリティオプション
- `--no-security-check`: APIキーやパスワードなどの機密データのスキャンをスキップ

## トークンカウントオプション
- `--token-count-encoding <encoding>`: カウント用のトークナイザーモデル：o200k_base（GPT-4o）、cl100k_base（GPT-3.5/4）など（デフォルト：o200k_base）
- `--token-budget <number>`: パックした出力がNトークンを超えた場合、ゼロ以外の終了コードで失敗。CIパイプラインやエージェントワークフローで、出力を対象モデルのコンテキストウィンドウ内に収めるためのガードとして有用。出力自体は生成され、終了コードのみがオーバーフローを通知

## MCPオプション
- `--mcp`: AI ツール統合用のModel Context Protocolサーバーとして実行
- `--sandbox [dir]`: （`--mcp`と併用）MCPサーバーのファイルツールをワークスペースディレクトリに制限（デフォルトは作業ディレクトリ、例：`--sandbox path/to/project`）。すべてのパスはそのルートからの相対パスになり、絶対パス/ホストのパスは拒否され、リモートパッケージ化、スキル生成、外部出力のアタッチは無効化されます。詳細は[MCPサーバー](/ja/guide/mcp-server)を参照

## Agent Skills生成オプション

| オプション | 説明 |
|-----------|------|
| `--skill-generate [name]` | Claude Agent Skills形式の出力を`.claude/skills/<name>/`ディレクトリに生成（名前省略時は自動生成） |
| `--skill-project-name <name>` | 生成されるスキルの説明で使用するプロジェクト名を上書き |
| `--skill-output <path>` | スキル出力ディレクトリパスを直接指定（ロケーションプロンプトをスキップ） |
| `-f, --force` | すべての確認プロンプトをスキップ（スキルディレクトリの上書き、リモート設定の信頼） |

## ウォッチモードオプション

- `-w, --watch`: ファイルの変更を監視し、自動的に再パックします。新規・変更・削除されたファイルを検出し、短時間に連続する変更はデバウンス（300 ms）され、再構築のたびにタイムスタンプが出力されます。停止するには `Ctrl+C` を押します。

ウォッチモードはローカルディレクトリでのみ動作するため、`--remote`、位置引数として渡すリモートリポジトリURL、`--stdout`、`--stdin`、`--split-output`、`--skill-generate`、`--copy` と組み合わせることはできません。これらの制限は、オプションをコマンドラインで指定した場合でも設定ファイルで指定した場合でも適用されます。

## 熱力学と進化のコマンド

Repomixは、リポジトリのGit履歴を読み取り、コードが負荷を受けている箇所を報告する2つの解析コマンドを提供しています。いずれもワークツリーに対して読み取り専用です。`heat`は何も書き込みません。`evolve`はすべての処理をテンポラリディレクトリ配下の一時的なGitワークツリーで実行するため、ブランチ、HEAD、未コミットの作業には一切影響しません。

### heat

コミットの入れ替わりの活発さ、作成者数、ファイルサイズ、循環複雑度からファイルごとの「温度」を測定し、しきい値以上のファイルを*沸騰中*として一覧表示します。

```bash
# Analyse the last 90 days of history
repomix heat .

# Widen the window and the report size
repomix heat . --days 365 --limit 50

# Machine-readable output
repomix heat . --json
```

| オプション | デフォルト | 説明 |
| --- | --- | --- |
| `--days <n>` | `90` | 解析するGit履歴の日数 |
| `--max-commits <n>` | `500` | 解析するコミット数の最大値 |
| `--t-max <n>` | `80` | 沸騰中のファイルと判定する温度のしきい値 |
| `--limit <n>` | `20` | テーブルに表示するファイル数 |
| `--json` | off | テーブルの代わりに生のレポートを出力 |
| `--no-fail` | off | 沸騰中のファイルが検出されても終了コード`0`を返す |
| `--report` | off | `thermodynamic-report.json`を`.manteka-memory/`に書き出す |

### evolve

リポジトリを一時的な変異体として分岐させ、沸騰中のファイルに変異を施し、変異体を生物学的適応度指数でランキングします。各変異体はdetached状態の専用Gitワークツリーで評価されるため、リポジトリが変更されることはありません。

```bash
# Explore five mutants from the current HEAD
repomix evolve .

# Restrict to one operator and two files
repomix evolve . --operator dead-guard --target src/legacy.ts

# Include the project's own test suite in the score
repomix evolve . --run-tests
```

| オプション | デフォルト | 説明 |
| --- | --- | --- |
| `--population <n>` | `5` | 評価する変異体の最大数 |
| `--operator <name>` | 3つすべて | 演算子を1つに限定（繰り返し指定可） |
| `--target <path>` | 沸騰中のファイル | 対象ファイルを限定（繰り返し指定可） |
| `--concurrency <n>` | `2` | 並列に評価する変異体の数 |
| `--run-tests` | off | 適応度指数にテストの軸を含める |
| `--test-timeout <ms>` | `300000` | 変異体ごとのテストスイートのタイムアウト |
| `--json` | off | テーブルの代わりに生のレポートを出力 |
| `--report` | off | `evolution-report.json`を`.manteka-memory/`に書き出す |

`--target`は対象を絞り込むためのものであり、広げたりはしません。対象は沸騰中のファイルの集合と積集合が取られるため、沸騰していないファイルを指定しても、そのファイルに対する変異体は生成されません。

**ランキングの意味。**3つの変異演算子はすべてコードを追加するため、温度をわずかに上昇させます。したがってどの変異体も未変更のベースラインよりわずかにスコアが低く、ランキングは**改善量が大きい順ではなく、害が小さい順**を意味します。冷却演算子が後のリリースで追加されるまで、表はこの解釈で読んでください。

::: warning テストスイートの実行について
`--run-tests`は、変異を加えたソースに対して、プロジェクト自身の`test`スクリプトを変異体ごとに1回ずつ実行します。これはプロジェクト内の任意のコードが変更された入力に対して実行されることを意味します。実行する意図がない限り無効のままにしてください。また、時間がかかることが見込まれます。
:::

## 関連リソース

- [設定](/ja/guide/configuration) - CLIフラグの代わりに設定ファイルでオプションを指定
- [出力フォーマット](/ja/guide/output) - XML、Markdown、JSON、プレーンテキストの詳細
- [コード圧縮](/ja/guide/code-compress) - `--compress`とTree-sitterの仕組み
- [セキュリティ](/ja/guide/security) - `--no-security-check`で無効になる機能

## 使用例

```bash
# 基本的な使用方法
repomix

# カスタム出力ファイルと形式
repomix -o my-output.xml --style xml

# 標準出力への出力
repomix --stdout > custom-output.txt

# 標準出力への出力後、他のコマンドへパイプ（例：simonw/llm）
repomix --stdout | llm "このコードについて説明してください"

# 圧縮を使用したカスタム出力
repomix --compress

# Git統合機能
repomix --include-logs   # Gitログを含める（デフォルトで50コミット）
repomix --include-logs --include-logs-count 10  # 最新10コミットを含める
repomix --include-diffs --include-logs  # 差分とログの両方を含める

# パターンを使用して特定のファイルを処理
repomix --include "src/**/*.ts,*.md" --ignore "*.test.js,docs/**"

# ブランチを指定したリモートリポジトリ
repomix --remote https://github.com/user/repo/tree/main

# コミットを指定したリモートリポジトリ
repomix --remote https://github.com/user/repo/commit/836abcd7335137228ad77feb28655d85712680f1

# ショートハンドを使用したリモートリポジトリ
repomix --remote user/repo

# ショートハンドを使用したリモートリポジトリ（自動検出、--remote 不要）
repomix user/repo

# stdinを使用したファイルリスト
find src -name "*.ts" -type f | repomix --stdin
git ls-files "*.js" | repomix --stdin
echo -e "src/index.ts\nsrc/utils.ts" | repomix --stdin

# トークン数分析
repomix --token-count-tree
repomix --token-count-tree 1000  # 1000以上のトークンを持つファイル/ディレクトリのみを表示

# ウォッチモード: ファイル変更時に自動的に再パック
repomix --watch
repomix -w --include "src/**/*.ts"
```

