import { $ as bunBuiltin } from "bun";

// Mutable holder so tests can replace `$` without module-level mocking
export const bunShell: { $: typeof bunBuiltin } = { $: bunBuiltin };
