// Configuration files to detect. Kept as pure data so the list can grow
// independently of the detection logic that consumes it.
export const CONFIG_FILE_PATTERNS: string[] = [
  // Package managers and dependencies
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'requirements.txt',
  'pyproject.toml',
  'Pipfile',
  'Pipfile.lock',
  'poetry.lock',
  'go.mod',
  'go.sum',
  'Cargo.toml',
  'Cargo.lock',
  'composer.json',
  'composer.lock',
  'Gemfile',
  'Gemfile.lock',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',

  // TypeScript/JavaScript config
  'tsconfig.json',
  'jsconfig.json',

  // Build tools
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mjs',
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mjs',
  'webpack.config.js',
  'webpack.config.ts',
  'rollup.config.js',
  'rollup.config.ts',
  'esbuild.config.js',
  'turbo.json',

  // Linters and formatters
  'biome.json',
  'biome.jsonc',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.json',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  'prettier.config.js',
  '.stylelintrc',
  '.stylelintrc.json',

  // Version managers
  '.node-version',
  '.nvmrc',
  '.ruby-version',
  '.python-version',
  '.go-version',
  '.java-version',
  '.tool-versions',

  // Docker
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',

  // CI/CD
  '.github',
  '.gitlab-ci.yml',
  'Jenkinsfile',
  '.circleci',
  '.travis.yml',

  // Editor config
  '.editorconfig',

  // Git
  '.gitignore',
  '.gitattributes',
];
