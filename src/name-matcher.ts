interface NameMatchOptions {
  exact?: boolean;
  glob?: boolean;
}

/** Glob selection uses only * and ?; all other characters are literal. */
export function createNameMatcher(pattern: string, options: NameMatchOptions) {
  if (options.exact && options.glob) {
    throw new Error('--exact and --glob cannot be used together');
  }
  if (options.exact) return (name: string) => name === pattern;
  if (!options.glob) return (name: string) => name.includes(pattern);

  const expression = Array.from(pattern, (character) => {
    if (character === '*') return '.*';
    if (character === '?') return '.';
    return character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }).join('');
  const glob = new RegExp(`^(?:${expression})$`, 'su');
  return (name: string) => glob.test(name);
}
