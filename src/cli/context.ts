import type { CliAdapter } from '../adapters/types.js';

export interface CommandContext {
  claudeDir: string;
  target: string;
}

export interface Terminal {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  write(message: string): void;
  writeError(message: string): void;
  confirm(prompt: string): Promise<boolean>;
  exit(code: number): never;
}

export interface CliRuntime {
  terminal: Terminal;
  adapters: {
    get(cli: string, claudeDir?: string): CliAdapter;
    all(): CliAdapter[];
    aiderConfig(): string;
  };
  files: {
    readText(file: string): string;
    writeText(file: string, content: string): void;
  };
}

export interface ListOptions {
  disabled?: boolean;
  enabled?: boolean;
  json?: boolean;
}
export interface SearchOptions {
  status?: string;
  json?: boolean;
}
export interface JsonOptions {
  json?: boolean;
}
export interface MutationOptions {
  plugin?: boolean;
  exact?: boolean;
  dryRun?: boolean;
  quiet?: boolean;
}
export interface ActivateOptions {
  dryRun?: boolean;
  quiet?: boolean;
}
export interface DeleteOptions {
  force?: boolean;
}
export interface OutputOptions {
  out?: string;
}
