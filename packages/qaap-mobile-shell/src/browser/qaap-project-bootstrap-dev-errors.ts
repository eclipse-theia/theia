// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Dev/install output that usually means dependencies were not installed (or only production deps). */
export const DEV_INSTALL_NEEDED_REGEX = /ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)|(?:sh|bash):\s*1:\s*(?:vite|esbuild|next|nuxt|astro): not found|Missing script:|npm error code ENOENT/i;

export const PORT_IN_USE_REGEX = /EADDRINUSE|address already in use/i;

/** Next.js refuses a second `next dev` while `.next/dev/lock` is held. */
export const NEXT_DEV_LOCK_REGEX = /Unable to acquire lock|another instance of next dev running/i;

/** Next.js log when it picks another port, e.g. `using available port 3001 instead`. */
export const NEXT_ALT_PORT_REGEX = /using available port (\d{2,5}) instead/gi;

const DEV_OUTPUT_URL_PORT_REGEX = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})\b/gi;

const ANSI_REGEX = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

export function terminalOutputNeedsInstall(output: string): boolean {
    return DEV_INSTALL_NEEDED_REGEX.test(output);
}

export function terminalOutputPortInUse(output: string): boolean {
    return PORT_IN_USE_REGEX.test(output);
}

export function terminalOutputNextDevLock(output: string): boolean {
    return NEXT_DEV_LOCK_REGEX.test(output);
}

/** Ports mentioned in dev-server stdout (Next alternate port, Local: URLs, …). */
export function extractDevOutputProbePorts(output: string): number[] {
    const clean = output.replace(ANSI_REGEX, '');
    const ports: number[] = [];
    for (const match of clean.matchAll(NEXT_ALT_PORT_REGEX)) {
        ports.push(Number(match[1]));
    }
    for (const match of clean.matchAll(DEV_OUTPUT_URL_PORT_REGEX)) {
        ports.push(Number(match[1]));
    }
    return [...new Set(ports.filter(p => Number.isFinite(p) && p > 0 && p < 65536))];
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
    if (terminalOutputNextDevLock(output)) {
        const ports = extractDevOutputProbePorts(output);
        const hint = ports.length > 0 ? ` Try Open preview · :${ports[0]}.` : ' Stop the other Next dev or remove .next/dev/lock, then retry.';
        return `Next.js is already running in this project.${hint}`;
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
