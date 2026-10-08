import type { DependencyInfo, TechStackInfo } from '../types.js';

export function parseGoMod(content: string): Partial<TechStackInfo> {
  const dependencies: DependencyInfo[] = [];
  const frameworks: string[] = [];

  // Parse require block
  const requireMatch = content.match(/require\s*\(([\s\S]*?)\)/);
  if (requireMatch) {
    const lines = requireMatch[1].split('\n');
    for (const line of lines) {
      const match = line.trim().match(/^([^\s]+)\s+([^\s]+)/);
      if (match) {
        const name = match[1];
        const version = match[2];
        dependencies.push({ name, version });

        if (name.includes('gin-gonic/gin')) frameworks.push('Gin');
        if (name.includes('labstack/echo')) frameworks.push('Echo');
        if (name.includes('gofiber/fiber')) frameworks.push('Fiber');
      }
    }
  }

  return { dependencies, frameworks: [...new Set(frameworks)] };
}
