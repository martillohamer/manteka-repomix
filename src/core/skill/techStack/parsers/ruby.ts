import type { DependencyInfo, TechStackInfo } from '../types.js';

export function parseGemfile(content: string): Partial<TechStackInfo> {
  const dependencies: DependencyInfo[] = [];
  const frameworks: string[] = [];

  const gemMatches = content.matchAll(/gem\s+['"]([^'"]+)['"]/g);
  for (const match of gemMatches) {
    const name = match[1];
    dependencies.push({ name });

    if (name === 'rails') frameworks.push('Rails');
    if (name === 'sinatra') frameworks.push('Sinatra');
  }

  return { dependencies, frameworks: [...new Set(frameworks)] };
}
