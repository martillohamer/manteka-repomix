---
title: 명령행 옵션
description: "입력, 출력, 파일 선택, 원격 저장소, 설정, 보안, 토큰 계산, MCP, Agent Skills를 위한 모든 Repomix CLI 옵션을 참조합니다."
---

# 명령행 옵션

## 기본 옵션
- `-v, --version`: 도구 버전 표시

## CLI 입출력 옵션

| 옵션 | 설명 |
|------|------|
| `--verbose` | 상세 디버그 로깅 활성화 (파일 처리, 토큰 수, 구성 세부사항 표시) |
| `--quiet` | 오류를 제외한 모든 콘솔 출력 억제 (스크립팅에 유용) |
| `--stdout` | 파일 대신 표준 출력으로 패키징 결과 직접 출력 (모든 로깅 억제) |
| `--stdin` | 표준 입력에서 파일 경로를 한 줄씩 읽기 (지정된 파일이 직접 처리됨) |
| `--copy` | 처리 후 생성된 출력을 시스템 클립보드에 복사 |
| `--token-count-tree [threshold]` | 토큰 수가 포함된 파일 트리 표시; 선택적 임계값으로 ≥N 토큰 파일만 표시 (예: `--token-count-tree 100`) |
| `--top-files-len <number>` | 요약에 표시할 가장 큰 파일 수 (기본값: `5`) |

## Repomix 출력 옵션

| 옵션 | 설명 |
|------|------|
| `-o, --output <file>` | 출력 파일 경로 (기본값: `repomix-output.xml`, 표준출력은 `"-"` 사용) |
| `--style <style>` | 출력 형식: `xml`, `markdown`, `json`, 또는 `plain` (기본값: `xml`) |
| `--output-file-path-style <style>` | 출력에 파일 경로를 표시하는 방식: `target-relative` 또는 `cwd-relative` (기본값: `target-relative`) |
| `--parsable-style` | 유효한 XML/Markdown을 보장하기 위해 특수 문자 이스케이프 (출력에 서식을 깨는 코드가 포함된 경우 필요) |
| `--compress` | Tree-sitter 파싱을 사용하여 핵심 코드 구조 추출 (클래스, 함수, 인터페이스) |
| `--output-show-line-numbers` | 출력의 각 줄에 줄 번호 접두사 추가 |
| `--no-file-summary` | 출력에서 파일 요약 섹션 생략 |
| `--no-directory-structure` | 출력에서 디렉토리 트리 시각화 생략 |
| `--no-files` | 파일 내용 없이 메타데이터만 생성 (저장소 분석에 유용) |
| `--remove-comments` | 패키징 전 모든 코드 주석 제거 |
| `--remove-empty-lines` | 모든 파일에서 빈 줄 제거 |
| `--truncate-base64` | 긴 base64 데이터 문자열을 잘라 출력 크기 축소 |
| `--header-text <text>` | 출력 시작 부분에 포함할 사용자 정의 텍스트 |
| `--instruction-file-path <path>` | 출력에 포함할 사용자 정의 지침이 있는 파일 경로 |
| `--split-output <size>` | 출력을 여러 번호가 매겨진 파일로 분할 (예: `repomix-output.1.xml`); `500kb`, `2mb`, `1.5mb` 등의 크기 지정 |
| `--include-empty-directories` | 디렉토리 구조에 파일이 없는 폴더 포함 |
| `--include-full-directory-structure` | `--include` 패턴 사용 시에도 디렉토리 구조 섹션에 전체 저장소 트리 표시 |
| `--no-git-sort-by-changes` | git 변경 빈도별 파일 정렬 비활성화 (기본값: 가장 자주 변경된 파일 우선) |
| `--include-diffs` | 작업 트리와 스테이징된 변경사항을 보여주는 git diff 섹션 추가 |
| `--include-logs` | 메시지와 변경 파일이 포함된 git 커밋 히스토리 추가 |
| `--include-logs-count <count>` | `--include-logs`와 함께 포함할 최근 커밋 수 (기본값: `50`) |

## 파일 선택 옵션

| 옵션 | 설명 |
|------|------|
| `--include <patterns>` | 이 glob 패턴과 일치하는 파일만 포함 (쉼표로 구분, 예: `"src/**/*.js,*.md"`) |
| `-i, --ignore <patterns>` | 제외할 추가 패턴 (쉼표로 구분, 예: `"*.test.js,docs/**"`) |
| `--no-gitignore` | `.gitignore` 규칙을 파일 필터링에 사용하지 않음 |
| `--no-dot-ignore` | `.ignore` 규칙을 파일 필터링에 사용하지 않음 |
| `--no-default-patterns` | 내장 무시 패턴 적용하지 않음 (`node_modules`, `.git`, 빌드 디렉토리 등) |

## 원격 저장소 옵션

| 옵션 | 설명 |
|------|------|
| `--remote <url>` | 원격 저장소 클론 및 패키징 (GitHub URL 또는 `user/repo` 형식) |
| `--remote-branch <name>` | 사용할 특정 브랜치, 태그 또는 커밋 (기본값: 저장소의 기본 브랜치) |
| `--remote-trust-config` | 원격 저장소의 설정 파일을 신뢰하고 로드합니다. 신뢰된 설정은 명령을 실행하거나 로컬 파일을 읽을 수 있으므로, 완전히 신뢰하는 저장소에서만 사용하세요 (보안상 기본적으로 비활성화). 대화형 터미널에서는 설정을 표시하고 확인을 요청합니다 |

## 구성 옵션

| 옵션 | 설명 |
|------|------|
| `-c, --config <path>` | `repomix.config.json` 대신 사용자 정의 구성 파일 사용 |
| `--init` | 기본 설정으로 새 `repomix.config.json` 파일 생성 |
| `--global` | `--init`과 함께 사용하여 현재 디렉토리 대신 홈 디렉토리에 구성 생성 |

## 보안 옵션
- `--no-security-check`: API 키와 암호 같은 민감한 데이터 스캔 건너뛰기

## 토큰 수 옵션
- `--token-count-encoding <encoding>`: 카운팅용 토크나이저 모델: o200k_base (GPT-4o), cl100k_base (GPT-3.5/4) 등 (기본값: o200k_base)
- `--token-budget <number>`: 패키징된 출력이 N개의 토큰을 초과하면 0이 아닌 종료 코드로 실패합니다. CI 파이프라인과 에이전트 워크플로에서 출력을 대상 모델의 컨텍스트 윈도우 내로 유지하기 위한 가드로 유용합니다. 출력은 여전히 생성되며, 종료 코드만 오버플로를 알립니다

## MCP 옵션
- `--mcp`: AI 도구 통합을 위한 Model Context Protocol 서버로 실행
- `--sandbox [dir]`: (`--mcp`와 함께 사용) MCP 서버의 파일 도구를 작업 공간 디렉토리로 제한합니다 (기본값: 작업 디렉토리; 예: `--sandbox path/to/project`). 모든 경로는 해당 루트를 기준으로 하며, 절대 경로/호스트 경로는 거부되고, 원격 패키징, 스킬 생성, 외부 출력 첨부가 비활성화됩니다. 자세한 내용은 [MCP 서버](/ko/guide/mcp-server) 문서를 참조하세요.

## Agent Skills 생성 옵션

| 옵션 | 설명 |
|------|------|
| `--skill-generate [name]` | Claude Agent Skills 형식 출력을 `.claude/skills/<name>/` 디렉토리에 생성 (이름 생략 시 자동 생성) |
| `--skill-project-name <name>` | 생성된 Skills 설명에 사용되는 프로젝트 이름을 재정의 |
| `--skill-output <path>` | 스킬 출력 디렉토리 경로를 직접 지정 (위치 선택 프롬프트 건너뜀) |
| `-f, --force` | 모든 확인 프롬프트 건너뜀 (스킬 디렉토리 덮어쓰기, 원격 설정 신뢰) |

## 감시 모드 옵션

- `-w, --watch`: 파일 변경을 감시하고 자동으로 다시 패킹합니다. 새 파일, 변경된 파일, 삭제된 파일이 감지되며, 빠르게 연속되는 변경은 디바운스(300 ms)되고, 다시 빌드할 때마다 타임스탬프가 출력됩니다. 중지하려면 `Ctrl+C`를 누르세요.

감시 모드는 로컬 디렉터리에서만 작동하므로 `--remote`, 위치 인수로 전달된 원격 저장소 URL, `--stdout`, `--stdin`, `--split-output`, `--skill-generate`, `--copy`와 함께 사용할 수 없습니다. 이러한 제한은 옵션을 명령줄에서 설정하든 구성 파일에서 설정하든 동일하게 적용됩니다.

## 열역학과 진화 명령

Repomix은 저장소의 Git 히스토리를 읽어 코드가 부담을 받는 지점을 보고하는 두 가지 분석 명령을 제공합니다. 두 명령 모두 워킹 트리에 대해 읽기 전용입니다. `heat`는 아무것도 쓰지 않으며, `evolve`는 모든 작업을 임시 디렉터리 아래의 일회용 Git 워크트리에서 수행하므로 브랜치, HEAD, 커밋되지 않은 작업에 영향을 주지 않습니다.

### heat

커밋 변동 빈도, 작성자 수, 파일 크기, 순환 복잡도로 파일별 "온도"를 측정하고, 임계값 이상인 파일을 *끓는* 파일로 목록에 표시합니다.

```bash
# Analyse the last 90 days of history
repomix heat .

# Widen the window and the report size
repomix heat . --days 365 --limit 50

# Machine-readable output
repomix heat . --json
```

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `--days <n>` | `90` | 분석할 Git 히스토리의 일수 |
| `--max-commits <n>` | `500` | 분석할 최대 커밋 수 |
| `--t-max <n>` | `80` | 끓는 파일로 판정하는 온도 임계값 |
| `--limit <n>` | `20` | 표에 표시할 파일 수 |
| `--json` | off | 표 대신 원본 보고서 출력 |
| `--no-fail` | off | 끓는 파일이 감지되어도 `0`으로 종료 |
| `--report` | off | `thermodynamic-report.json`을 `.manteka-memory/`에 기록 |

### evolve

저장소를 일회성 변이체로 분기하고, 끓는 파일에 변이를 적용한 뒤, 변이체를 생물학적 적합도 지수로 순위 매깁니다. 모든 변이체는 전용 detached Git 워크트리에서 평가되므로 저장소가 수정되지 않습니다.

```bash
# Explore five mutants from the current HEAD
repomix evolve .

# Restrict to one operator and two files
repomix evolve . --operator dead-guard --target src/legacy.ts

# Include the project's own test suite in the score
repomix evolve . --run-tests
```

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `--population <n>` | `5` | 평가할 최대 변이체 수 |
| `--operator <name>` | 세 가지 모두 | 연산자를 하나로 제한 (반복 지정 가능) |
| `--target <path>` | 끓는 파일 | 대상 파일로 제한 (반복 지정 가능) |
| `--concurrency <n>` | `2` | 병렬로 평가하는 변이체 수 |
| `--run-tests` | off | 적합도 지수에 테스트 축 포함 |
| `--test-timeout <ms>` | `300000` | 변이체별 테스트 스위트 제한 시간 |
| `--json` | off | 표 대신 원본 보고서 출력 |
| `--report` | off | `evolution-report.json`을 `.manteka-memory/`에 기록 |

`--target`은 범위를 좁히기만 하고 넓히지 않습니다. 대상은 끓는 파일 집합과 교집합을 취하므로, 끓지 않는 파일을 지정하면 그 파일에 대한 변이체는 생성되지 않습니다.

**순위의 의미.** 세 가지 변이 연산자는 모두 코드를 추가하기 때문에 온도를 약간 높입니다. 따라서 모든 변이체는 변경되지 않은 기준선보다 약간 낮은 점수를 받으며, 순위는 개선 폭이 가장 큰 순서가 아니라 **해가 가장 작은 순서**를 뜻합니다. 냉각 연산자가 이후 릴리스에 도착할 때까지 표를 이 방식으로 해석하세요.

::: warning 테스트 스위트 실행에 관하여
`--run-tests`는 변이가 적용된 소스에서 프로젝트 자체의 `test` 스크립트를 변이체마다 한 번씩 실행합니다. 이는 프로젝트의 임의 코드가 수정된 입력에 대해 실행된다는 뜻입니다. 실행할 의도가 없다면 꺼 두세요. 시간이 오래 걸리는 것도 예상해야 합니다.
:::

## 관련 리소스

- [설정](/ko/guide/configuration) - CLI 플래그 대신 설정 파일로 옵션 지정
- [출력 형식](/ko/guide/output) - XML, Markdown, JSON, 일반 텍스트 형식 상세 정보
- [코드 압축](/ko/guide/code-compress) - `--compress`와 Tree-sitter의 작동 방식
- [보안](/ko/guide/security) - `--no-security-check`로 비활성화되는 기능

## 예시

```bash
# 기본 사용법
repomix

# 사용자 정의 출력 파일과 형식
repomix -o my-output.xml --style xml

# 표준 출력으로 출력
repomix --stdout > custom-output.txt

# 표준 출력으로 출력한 후 다른 명령으로 파이프 (예: simonw/llm)
repomix --stdout | llm "이 코드가 무엇을 하는지 설명해주세요."

# 압축을 사용한 사용자 정의 출력
repomix --compress

# Git 통합 기능
repomix --include-logs   # git 로그 포함 (기본 50개 커밋)
repomix --include-logs --include-logs-count 10  # 최근 10개 커밋 포함
repomix --include-diffs --include-logs  # 차이점과 로그 모두 포함

# 패턴으로 특정 파일 처리
repomix --include "src/**/*.ts,*.md" --ignore "*.test.js,docs/**"

# 브랜치가 있는 원격 저장소
repomix --remote https://github.com/user/repo/tree/main

# 커밋이 있는 원격 저장소
repomix --remote https://github.com/user/repo/commit/836abcd7335137228ad77feb28655d85712680f1

# 축약형을 사용한 원격 저장소
repomix --remote user/repo

# 축약형을 사용한 원격 저장소 (자동 감지, --remote 불필요)
repomix user/repo

# stdin을 사용한 파일 목록
find src -name "*.ts" -type f | repomix --stdin
git ls-files "*.js" | repomix --stdin
echo -e "src/index.ts\nsrc/utils.ts" | repomix --stdin

# 토큰 수 분석
repomix --token-count-tree
repomix --token-count-tree 1000  # 1000개 이상의 토큰을 가진 파일/디렉토리만 표시

# 감시 모드: 파일 변경 시 자동으로 다시 패킹
repomix --watch
repomix -w --include "src/**/*.ts"
```

