import type { DependencyInfo, TechStackInfo } from '../types.js';

export function parseRequirementsTxt(content: string): Partial<TechStackInfo> {
  const dependencies: DependencyInfo[] = [];
  const frameworks: string[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;

    // Parse package==version or package>=version format
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)([=<>!~]+)?(.+)?$/);
    if (match) {
      const name = match[1];
      const version = match[3];
      dependencies.push({ name, version });

      // Detect frameworks
      if (name.toLowerCase() === 'django') frameworks.push('Django');
      if (name.toLowerCase() === 'flask') frameworks.push('Flask');
      if (name.toLowerCase() === 'fastapi') frameworks.push('FastAPI');
      if (name.toLowerCase() === 'pytorch' || name.toLowerCase() === 'torch') frameworks.push('PyTorch');
      if (name.toLowerCase() === 'tensorflow') frameworks.push('TensorFlow');
    }
  }

  return { dependencies, frameworks: [...new Set(frameworks)] };
}

export function parsePyprojectToml(content: string): Partial<TechStackInfo> {
  const dependencies: DependencyInfo[] = [];
  const frameworks: string[] = [];

  // Simple TOML parsing for dependencies
  const depsMatch = content.match(/\[project\.dependencies\]([\s\S]*?)(?=\[|$)/);
  if (depsMatch) {
    const depsSection = depsMatch[1];
    const depLines = depsSection.match(/"([^"]+)"/g);
    if (depLines) {
      for (const dep of depLines) {
        const name = dep
          .replace(/"/g, '')
          .split(/[=<>!~]/)[0]
          .trim();
        if (name) {
          dependencies.push({ name });
          if (name.toLowerCase() === 'django') frameworks.push('Django');
          if (name.toLowerCase() === 'flask') frameworks.push('Flask');
          if (name.toLowerCase() === 'fastapi') frameworks.push('FastAPI');
        }
      }
    }
  }

  return { dependencies, frameworks: [...new Set(frameworks)] };
}

export function parsePipfile(content: string): Partial<TechStackInfo> {
  const dependencies: DependencyInfo[] = [];

  // Simple parsing for [packages] section
  const packagesMatch = content.match(/\[packages\]([\s\S]*?)(?=\[|$)/);
  if (packagesMatch) {
    const lines = packagesMatch[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+)\s*=/);
      if (match) {
        dependencies.push({ name: match[1] });
      }
    }
  }

  return { dependencies };
}
