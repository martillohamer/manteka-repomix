import type { DependencyInfo, TechStackInfo } from '../types.js';

export function parsePackageJson(content: string): Partial<TechStackInfo> {
  try {
    const pkg = JSON.parse(content);
    const dependencies: DependencyInfo[] = [];
    const devDependencies: DependencyInfo[] = [];
    const frameworks: string[] = [];

    // Parse dependencies
    if (pkg.dependencies) {
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        dependencies.push({ name, version: String(version) });

        // Detect frameworks
        if (name === 'react' || name === 'react-dom') frameworks.push('React');
        if (name === 'vue') frameworks.push('Vue');
        if (name === 'next') frameworks.push('Next.js');
        if (name === 'nuxt') frameworks.push('Nuxt');
        if (name === '@angular/core') frameworks.push('Angular');
        if (name === 'express') frameworks.push('Express');
        if (name === 'fastify') frameworks.push('Fastify');
        if (name === 'hono') frameworks.push('Hono');
        if (name === 'svelte') frameworks.push('Svelte');
      }
    }

    // Parse devDependencies
    if (pkg.devDependencies) {
      for (const [name, version] of Object.entries(pkg.devDependencies)) {
        devDependencies.push({ name, version: String(version), isDev: true });

        // Detect TypeScript
        if (name === 'typescript') frameworks.push('TypeScript');
      }
    }

    // Detect package manager
    let packageManager: string | undefined;
    if (pkg.packageManager) {
      const pm = String(pkg.packageManager);
      if (pm.startsWith('pnpm')) packageManager = 'pnpm';
      else if (pm.startsWith('yarn')) packageManager = 'yarn';
      else if (pm.startsWith('npm')) packageManager = 'npm';
      else if (pm.startsWith('bun')) packageManager = 'bun';
    }

    return {
      dependencies,
      devDependencies,
      frameworks: [...new Set(frameworks)],
      packageManager,
    };
  } catch {
    return {};
  }
}
