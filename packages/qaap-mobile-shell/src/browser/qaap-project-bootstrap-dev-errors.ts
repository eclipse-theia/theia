// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Dev/install output that usually means dependencies were not installed (or only production deps). */
export const DEV_INSTALL_NEEDED_REGEX = /ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)|(?:sh|bash):\s*1:\s*(?:vite|esbuild|next|nuxt|astro): not found|Missing script:|npm error code ENOENT/i;

export const PORT_IN_USE_REGEX = /EADDRINUSE|address already in use/i;

const ANSI_REGEX = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

export function terminalOutputNeedsInstall(output: string): boolean {
    return DEV_INSTALL_NEEDED_REGEX.test(output);
}

export function terminalOutputPortInUse(output: string): boolean {
    return PORT_IN_USE_REGEX.test(output);
}

export function isTerminalDoesNotExistError(message: string): boolean {
    return /terminal "[\d]+" does not exist/i.test(message);
}

/** Picks the most useful single-line error from the tail of terminal output. */
export function extractTerminalFailureLine(output: string, fallback: string): string {
    if (terminalOutputNeedsInstall(output)) {
        return 'Dev dependencies are missing. Run Install — on Docker, NODE_ENV=production skips devDependencies until install runs with NODE_ENV=development.';
    }
    if (terminalOutputPortInUse(output)) {
        return 'Dev port is already in use. Close the other process or use Preview again so Qaap picks another port.';
    }
    const clean = output.replace(ANSI_REGEX, '');
    const lines = clean.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (/^(Error|error|npm error|failed to|Cannot find)/i.test(line)) {
            return line.length > 220 ? `${line.slice(0, 217)}…` : line;
        }
    }
    return fallback;
}
