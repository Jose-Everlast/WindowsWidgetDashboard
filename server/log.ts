export const log = (scope: string, ...args: unknown[]) => console.log(`[${scope}]`, ...args);
export const logError = (scope: string, ...args: unknown[]) => console.error(`[${scope}]`, ...args);
