import type { DependencyInfo, TechStackInfo } from '../types.js';

export function parsePomXml(content: string): Partial<TechStackInfo> {
  const dependencies: DependencyInfo[] = [];
  const frameworks: string[] = [];

  // Simple XML parsing for dependencies
  const depMatches = content.matchAll(/<dependency>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<\/dependency>/g);
  for (const match of depMatches) {
    const name = match[1];
    dependencies.push({ name });

    if (name.includes('spring')) frameworks.push('Spring');
  }

  return { dependencies, frameworks: [...new Set(frameworks)] };
}

export function parseBuildGradle(content: string): Partial<TechStackInfo> {
  const dependencies: DependencyInfo[] = [];
  const frameworks: string[] = [];

  // Parse implementation/compile dependencies
  const depMatches = content.matchAll(/(?:implementation|compile)\s*['"(]([^'"()]+)['"]/g);
  for (const match of depMatches) {
    const dep = match[1];
    const parts = dep.split(':');
    const name = parts.length >= 2 ? parts[1] : dep;
    dependencies.push({ name });

    if (dep.includes('spring')) frameworks.push('Spring');
    if (dep.includes('ktor')) frameworks.push('Ktor');
  }

  return { dependencies, frameworks: [...new Set(frameworks)] };
}
