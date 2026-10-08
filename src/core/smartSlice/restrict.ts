export interface SmartSliceRestriction {
  kept: string[];
  skipped: string[];
}

/**
 * Intersects the search results with the Smart-Slice closure. `kept` preserves the
 * search order (the packer re-sorts downstream anyway); `skipped` lists closure
 * paths that the include/ignore/gitignore filters removed, so the caller can warn
 * that a dependency will not be packed.
 */
export const restrictFilePathsToSmartSlice = (
  filePaths: string[],
  smartSlicePaths: Set<string>,
): SmartSliceRestriction => {
  const searched = new Set(filePaths);
  return {
    kept: filePaths.filter((filePath) => smartSlicePaths.has(filePath)),
    skipped: [...smartSlicePaths].filter((filePath) => !searched.has(filePath)).sort(),
  };
};
