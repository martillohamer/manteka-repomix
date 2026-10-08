import type { DependencyInfo, TechStackInfo } from '../types.js';

export function parseComposerJson(content: string): Partial<TechStackInfo> {
  try {
    const composer = JSON.parse(content);
    const dependencies: DependencyInfo[] = [];
    const frameworks: string[] = [];

    if (composer.require) {
      for (const [name, version] of Object.entries(composer.require)) {
        if (name !== 'php') {
          dependencies.push({ name, version: String(version) });

          if (name.startsWith('laravel/')) frameworks.push('Laravel');
          if (name.startsWith('symfony/')) frameworks.push('Symfony');
        }
      }
    }

    return { dependencies, frameworks: [...new Set(frameworks)] };
  } catch {
    return {};
  }
}
