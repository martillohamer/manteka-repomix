import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../shared/logger.js';

/** Words too common to carry signal when correlating memory. */
const STOP_WORDS = new Set(['a', 'and', 'the', 'of', 'to', 'in', 'is', 'it', 'for', 'on', 'why', 'how', 'when']);

export const tokenizeQuery = (query: string): string[] =>
  Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((term) => term.length > 2 && !STOP_WORDS.has(term)),
    ),
  );

type Relevance = 'high' | 'medium' | 'low';

export const relevanceFor = (coverage: number): Relevance => {
  if (coverage >= 0.75) return 'high';
  if (coverage >= 0.4) return 'medium';
  return 'low';
};

export interface SemanticMatchCandidate {
  source: string;
  content: string;
  timestamp: string | null;
  termsMatched: number;
}

export interface MemoryEntries {
  notes: string[];
  hasHistory: boolean;
}

/** Timestamp of the first `[...]` token of a history.log line, which is ISO-8601. */
const historyLineTimestamp = (line: string): string | null => {
  const match = /^\[([^\]]+)]/.exec(line);
  const candidate = match?.[1];
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : null;
};

/** ISO timestamp for chronological sorting; undated entries sink to the end. */
const epochOf = (timestamp: string | null): number => {
  if (timestamp === null) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

export const sortMatchesByTime = (candidates: SemanticMatchCandidate[]): SemanticMatchCandidate[] =>
  [...candidates].sort((a, b) => epochOf(a.timestamp) - epochOf(b.timestamp));

/** How many distinct query terms a source covers. Zero means "no correlation". */
const countMatchedTerms = (haystack: string, queryTerms: string[]): number => {
  let termsMatched = 0;
  for (const term of queryTerms) {
    if (haystack.includes(term)) termsMatched += 1;
  }
  return termsMatched;
};

const isNotFoundError = (error: unknown): boolean => (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';

/**
 * Snapshot the memory directory. A missing directory is a legitimate state (no
 * memory recorded yet) and yields an empty snapshot; any other failure propagates
 * to the caller so sandbox errors stay meaningful. Symbolic entries (file symlinks
 * and Windows directory junctions) are excluded: a note link is the one vector that
 * could otherwise pull content from outside the sandboxed root into a tool response.
 */
export const readMemoryDirectoryEntries = async (memoryDir: string): Promise<MemoryEntries> => {
  let dirents: Dirent[];
  try {
    dirents = await fs.readdir(memoryDir, { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) return { notes: [], hasHistory: false };
    throw error;
  }

  const notes: string[] = [];

  for (const dirent of dirents) {
    if (dirent.isSymbolicLink()) continue;
    if (dirent.isFile() && dirent.name.endsWith('.md')) notes.push(dirent.name);
  }

  return { notes: notes.sort(), hasHistory: dirents.some((d) => d.isFile() && d.name === 'history.log') };
};

export const collectHistoryMatches = async (
  entries: MemoryEntries,
  memoryDir: string,
  queryTerms: string[],
): Promise<SemanticMatchCandidate[]> => {
  if (!entries.hasHistory) return [];
  const content = await fs.readFile(path.join(memoryDir, 'history.log'), 'utf8');
  const matches: SemanticMatchCandidate[] = [];

  for (const line of content.split('\n')) {
    if (line.trim() === '') continue;
    const termsMatched = countMatchedTerms(line.toLowerCase(), queryTerms);
    if (termsMatched === 0) continue;
    matches.push({
      source: 'history.log',
      content: line,
      timestamp: historyLineTimestamp(line),
      termsMatched,
    });
  }

  return matches;
};

export const collectNoteMatches = async (
  entries: MemoryEntries,
  memoryDir: string,
  queryTerms: string[],
): Promise<SemanticMatchCandidate[]> => {
  const matches: SemanticMatchCandidate[] = [];

  for (const note of entries.notes) {
    const notePath = path.join(memoryDir, note);
    const content = await fs.readFile(notePath, 'utf8');
    const { mtime } = await fs.stat(notePath);
    const termsMatched = countMatchedTerms(content.toLowerCase(), queryTerms);
    if (termsMatched === 0) continue;
    matches.push({
      source: `note:${note}`,
      content: summarizeContent(content, note),
      timestamp: mtime.toISOString(),
      termsMatched,
    });
  }

  return matches;
};

export const collectHealthReportMatches = async (
  memoryDir: string,
  queryTerms: string[],
): Promise<SemanticMatchCandidate[]> => {
  const report = await readHealthReport(path.join(memoryDir, 'health-report.json'));
  if (report === null) return [];

  const termsMatched = countMatchedTerms(JSON.stringify(report).toLowerCase(), queryTerms);
  if (termsMatched === 0) return [];
  return [
    {
      source: 'health-report.json',
      content: summarizeContent(JSON.stringify(report, null, 2), 'codebase health metrics'),
      timestamp: typeof report.timestamp === 'string' ? report.timestamp : null,
      termsMatched,
    },
  ];
};

const summarizeContent = (content: string, label: string, limit = 300): string => {
  const trimmed = content.trim();
  const body = trimmed.length > limit ? `${trimmed.slice(0, limit)}...` : trimmed;
  return `${label}: ${body}`;
};

const readHealthReport = async (reportPath: string): Promise<Record<string, unknown> | null> => {
  try {
    return JSON.parse(await fs.readFile(reportPath, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    logger.trace(`manteka_semantic_debug: no readable health report (${error})`);
    return null;
  }
};

export const buildSemanticSummary = (query: string, matchCount: number, hasHistory: boolean): string => {
  if (matchCount === 0) {
    const hint = hasHistory ? 'Try broadening the keywords.' : 'No memory has been recorded yet.';
    return `No temporal or semantic correlation found for "${query}". ${hint}`;
  }
  return `Found ${matchCount} correlation(s) for "${query}", ordered oldest to newest.`;
};
