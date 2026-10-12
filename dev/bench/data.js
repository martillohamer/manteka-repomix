window.BENCHMARK_DATA = {
  "lastUpdate": 1791835616413,
  "repoUrl": "https://github.com/martillohamer/manteka-repomix",
  "entries": {
    "Repomix Performance": [
      {
        "commit": {
          "author": {
            "email": "martillohamer@users.noreply.github.com",
            "name": "martillohamer",
            "username": "martillohamer"
          },
          "committer": {
            "email": "martillohamer@users.noreply.github.com",
            "name": "martillohamer",
            "username": "martillohamer"
          },
          "distinct": true,
          "id": "fc3a14c4d8ed0a4434572e2ed580ac28cf738fed",
          "message": "feat(manteka): complete CLI expansion, restore green build and typecheck (198/198 files, 2352/2352 tests)\n\nintent(cli-expansion): fourth and final capability — `manteka slice --export <format>` so the\nSmart-Slice dependency closure can be injected directly as RAG context in LLM prompts\ndecision(shared-formatters): slice/doctor/analyze engines moved to core/ so CLI and MCP consume one\nimplementation; a test asserts the MCP tool and the CLI subcommand emit byte-identical output\nrejected(export-formats): only markdown/json/xml — no YAML, keeping the set explicit so a typo in\n--export fails loudly instead of silently defaulting to an unrequested format\nconstraint(slice-export): markdown fences escalate past any fence present in the content, and XML\nsplits ]]> so file contents cannot close the CDATA block early\n\nfix(mcp-sandbox): Manteka tools were registered on the SDK server unconditionally, but manteka_heal\nwrites caller-supplied paths and analyze walks a caller-supplied root — now gated behind !sandboxed\nfix(mcp-server): createMcpServer passed the SDK McpServer to registerMantekaTools, which calls\nregisterToolHandler — a method the SDK lacks, so startup would throw; a test mock had faked it\ndecision(mcp-sdk-adapter): adapt handlers onto the SDK registerTool API with real JSON Schemas instead\nof casting the server, since the SDK's generic Zod signature admits no structural type\nfix(mcp-protocol): ToolCallResponse required `result`, contradicting JSON-RPC 2.0 where a response\ncarries result XOR error; error paths returned spec-conformant bodies the type rejected\nfix(mcp-memory-search): every call seeded a junk record into the user's lineage store and then invoked\na non-existent recall(), so it always returned \"Memory search failed\"; now read-only via findSimilar\nfix(swarm-orchestrator): deps.readFile was ignored — `deps.readFile ?? (async () => {...})()` binds the\ncall tighter than ??, so a supplied reader was awaited to itself and passed as content to the agents\nfix(swarm-bus): AgentRole was used but never imported; the bus field was typed from the value module\nwhile the interface lives in types, so naming it directly collided\nfix(analyze-engine): sibling imports were discarded (path.normalize strips the leading \"./\" the filter\ntested for) and edges resolved from cwd (dirname of a basename), leaving the graph permanently empty\nfix(doctor-tooling): the four doctor checks were referenced but never imported; shared with the CLI\nbuild(tsconfig): added vitest/globals — the config already sets globals: true, so tests legitimately\nrely on them; this alone cleared 140 of 198 type errors\nchore(repo-hygiene): dropped 17 committed test-output and runtime-scratch files; healer tests now write\nscratch fixtures to os.tmpdir() instead of the repo, and .gitignore keeps them out\n\nnpm run build: 0 errors | npm run lint-ts: 0 errors | vitest: 198 files, 2352/2352 passing",
          "timestamp": "2026-10-12T21:46:53+02:00",
          "tree_id": "5903e38d748307861c3d2b2b8bfe08516cd8d394",
          "url": "https://github.com/martillohamer/manteka-repomix/commit/fc3a14c4d8ed0a4434572e2ed580ac28cf738fed"
        },
        "date": 1791834533018,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Repomix Pack (macOS)",
            "value": 969,
            "range": "±127",
            "unit": "ms",
            "extra": "Median of 30 runs\nQ1: 907ms, Q3: 1034ms\nAll times: 820, 832, 848, 860, 876, 899, 903, 907, 921, 924, 927, 932, 937, 952, 954, 969, 971, 998, 1004, 1007, 1009, 1032, 1034, 1036, 1058, 1063, 1083, 1086, 1089, 1095ms"
          },
          {
            "name": "Repomix Pack (Linux)",
            "value": 821,
            "range": "±21",
            "unit": "ms",
            "extra": "Median of 20 runs\nQ1: 812ms, Q3: 833ms\nAll times: 797, 799, 800, 803, 805, 812, 813, 814, 815, 820, 821, 822, 823, 829, 831, 833, 838, 853, 921, 975ms"
          },
          {
            "name": "Repomix Pack (Windows)",
            "value": 813,
            "range": "±23",
            "unit": "ms",
            "extra": "Median of 20 runs\nQ1: 806ms, Q3: 829ms\nAll times: 796, 798, 800, 803, 805, 806, 808, 808, 809, 811, 813, 814, 818, 818, 825, 829, 833, 845, 867, 871ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "martillohamer@users.noreply.github.com",
            "name": "martillohamer",
            "username": "martillohamer"
          },
          "committer": {
            "email": "martillohamer@users.noreply.github.com",
            "name": "martillohamer",
            "username": "martillohamer"
          },
          "distinct": true,
          "id": "5d3ecd7f2ec5ad9ab61474098a4b6dcf7b2691cf",
          "message": "feat(analyze): implement real --deep expansion and fix three engine bugs\n\nintent(analyze): `--deep` was accepted but never read — both modes returned identical\nresults, so the flag was documentation-only and the engine reported no dependencies at all\ndecision(deep-semantics): anchor the distinction on expansion depth, not a single entry file,\nsince this engine analyses a whole project. `dependencyGraph` always holds direct one-hop\nedges so `--deep` can only add information; deep additionally computes `transitiveGraph`\n(closure per node), longest-path `maxImportDepth`, `depthDistribution`,\n`transitiveFileCount`, `entryPoints` and `leafFiles`\ndecision(shallow-default): omitting `--deep` now means shallow, per spec; this flips the\npreviously documented default of `true`\ndecision(metric-omission): shallow omits the extended metrics rather than reporting them as 0,\nso \"not measured\" cannot be mistaken for \"measured as none\"\nlearned(metric-naming): \"files nothing imports\" are graph roots, not leaves — reporting them\nas `leafFiles` was misleading, so both `entryPoints` and `leafFiles` are now emitted\n\nfix(analyze-imports): side-effect imports (`import './polyfill'`) never matched — the regex's\nthird branch required a second literal `import`, but `^import\\s+` had already consumed it\nfix(analyze-depth): calculateImportDepthsSimple shared one `visited` set and only marked nodes\nafter recursion returned, so a cycle (a -> b -> a) recursed until the stack overflowed, and\ndepths for DAGs with shared nodes depended on visit order; now memoised with an on-stack guard\nfix(manteka-bin): bin/manteka.cjs imported ../src/cli/index.js, a .ts file that never exists at\nruntime, so every `manteka <cmd>` died with ERR_MODULE_NOT_FOUND; repomix.cjs and\nmanteka-mcp.cjs already pointed at ../lib\nperf(analyze-walk): skip node_modules/.git/dist/build/coverage/lib/.next/out when walking, and\nno longer statSync each entry to re-check isDirectory\n\ncli: both the Commander action and the main() dispatcher now share printAnalysisReport, so the\nlegacy path surfaces the same deep metrics instead of a duplicated three-line summary\ncli: `--deep` plumbed through the MCP tool as a boolean that genuinely changes the result\n\nnpm run build: 0 errors | npm run lint-ts: 0 errors | vitest: 198 files, 2371/2371 passing",
          "timestamp": "2026-10-12T22:04:33+02:00",
          "tree_id": "2ecfe7c40771d009d96f39002a4880ef151e9ad5",
          "url": "https://github.com/martillohamer/manteka-repomix/commit/5d3ecd7f2ec5ad9ab61474098a4b6dcf7b2691cf"
        },
        "date": 1791835615818,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Repomix Pack (macOS)",
            "value": 1012,
            "range": "±448",
            "unit": "ms",
            "extra": "Median of 30 runs\nQ1: 726ms, Q3: 1174ms\nAll times: 645, 664, 669, 687, 704, 712, 717, 726, 912, 912, 935, 938, 954, 991, 998, 1012, 1019, 1054, 1092, 1096, 1135, 1155, 1174, 1189, 1197, 1266, 1281, 1319, 1322, 1392ms"
          },
          {
            "name": "Repomix Pack (Linux)",
            "value": 1077,
            "range": "±33",
            "unit": "ms",
            "extra": "Median of 20 runs\nQ1: 1068ms, Q3: 1101ms\nAll times: 1033, 1049, 1051, 1059, 1061, 1068, 1074, 1075, 1075, 1076, 1077, 1079, 1090, 1094, 1096, 1101, 1101, 1107, 1107, 1109ms"
          },
          {
            "name": "Repomix Pack (Windows)",
            "value": 1506,
            "range": "±102",
            "unit": "ms",
            "extra": "Median of 20 runs\nQ1: 1486ms, Q3: 1588ms\nAll times: 1458, 1471, 1471, 1479, 1481, 1486, 1486, 1500, 1503, 1505, 1506, 1509, 1513, 1532, 1549, 1588, 1706, 1715, 1727, 1736ms"
          }
        ]
      }
    ]
  }
}