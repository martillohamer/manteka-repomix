import type { TechStackInfo } from './types.js';

/**
 * Generates tech-stacks.md content from detected tech stacks.
 */
export const generateTechStackMd = (techStacks: TechStackInfo[]): string => {
  const lines: string[] = ['# Tech Stacks', ''];

  for (const techStack of techStacks) {
    lines.push(`## Tech Stack: ${techStack.path}`, '');

    // Languages
    if (techStack.languages.length > 0) {
      lines.push('### Languages');
      lines.push('');
      for (const lang of techStack.languages) {
        lines.push(`- ${lang}`);
      }
      lines.push('');
    }

    // Frameworks
    if (techStack.frameworks.length > 0) {
      lines.push('### Frameworks');
      lines.push('');
      for (const fw of techStack.frameworks) {
        lines.push(`- ${fw}`);
      }
      lines.push('');
    }

    // Runtime Versions
    if (techStack.runtimeVersions.length > 0) {
      lines.push('### Runtime Versions');
      lines.push('');
      for (const rv of techStack.runtimeVersions) {
        lines.push(`- ${rv.runtime}: ${rv.version}`);
      }
      lines.push('');
    }

    // Package Manager
    if (techStack.packageManager) {
      lines.push('### Package Manager');
      lines.push('');
      lines.push(`- ${techStack.packageManager}`);
      lines.push('');
    }

    // Dependencies
    if (techStack.dependencies.length > 0) {
      lines.push('### Dependencies');
      lines.push('');
      for (const dep of techStack.dependencies) {
        const version = dep.version ? ` (${dep.version})` : '';
        lines.push(`- ${dep.name}${version}`);
      }
      lines.push('');
    }

    // Dev Dependencies
    if (techStack.devDependencies.length > 0) {
      lines.push('### Dev Dependencies');
      lines.push('');
      for (const dep of techStack.devDependencies) {
        const version = dep.version ? ` (${dep.version})` : '';
        lines.push(`- ${dep.name}${version}`);
      }
      lines.push('');
    }

    // Configuration Files
    if (techStack.configFiles.length > 0) {
      lines.push('### Configuration Files');
      lines.push('');
      for (const file of techStack.configFiles) {
        lines.push(`- ${file}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trim();
};
