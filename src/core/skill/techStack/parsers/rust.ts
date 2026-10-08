import type { DependencyInfo, TechStackInfo } from '../types.js';

export function parseCargoToml(content: string): Partial<TechStackInfo> {
  const dependencies: DependencyInfo[] = [];
  const frameworks: string[] = [];

  // Parse [dependencies] section
  const depsMatch = content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/);
  if (depsMatch) {
    const lines = depsMatch[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+)\s*=/);
      if (match) {
        const name = match[1];
        dependencies.push({ name });

        if (name === 'actix-web') frameworks.push('Actix');
        if (name === 'axum') frameworks.push('Axum');
        if (name === 'rocket') frameworks.push('Rocket');
        if (name === 'tokio') frameworks.push('Tokio');
      }
    }
  }

  return { dependencies, frameworks: [...new Set(frameworks)] };
}
