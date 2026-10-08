import { parseGoMod } from './parsers/go.js';
import { parseBuildGradle, parsePomXml } from './parsers/jvm.js';
import { parsePackageJson } from './parsers/packageJson.js';
import { parseComposerJson } from './parsers/php.js';
import { parsePipfile, parsePyprojectToml, parseRequirementsTxt } from './parsers/python.js';
import { parseGemfile } from './parsers/ruby.js';
import { parseCargoToml } from './parsers/rust.js';
import type { DependencyFileConfig } from './types.js';

// Dependency file patterns and their parsers
export const DEPENDENCY_FILES: Record<string, DependencyFileConfig> = {
  'package.json': { language: 'Node.js', parser: parsePackageJson },
  'requirements.txt': { language: 'Python', parser: parseRequirementsTxt },
  'pyproject.toml': { language: 'Python', parser: parsePyprojectToml },
  Pipfile: { language: 'Python', parser: parsePipfile },
  'go.mod': { language: 'Go', parser: parseGoMod },
  'Cargo.toml': { language: 'Rust', parser: parseCargoToml },
  'composer.json': { language: 'PHP', parser: parseComposerJson },
  Gemfile: { language: 'Ruby', parser: parseGemfile },
  'pom.xml': { language: 'Java', parser: parsePomXml },
  'build.gradle': { language: 'Java/Kotlin', parser: parseBuildGradle },
  'build.gradle.kts': { language: 'Kotlin', parser: parseBuildGradle },
};
