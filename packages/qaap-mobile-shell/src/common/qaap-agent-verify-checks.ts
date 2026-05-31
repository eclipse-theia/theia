// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export type QaapVerifyCheckKind = 'build' | 'test' | 'typecheck' | 'lint';

export interface QaapResolvedVerifyCheck {
    readonly kind: QaapVerifyCheckKind;
    readonly script: string;
    readonly command: string;
}

/** Scripts picked for agent transcript verification, in priority order. */
const VERIFY_SCRIPT_PRIORITY: ReadonlyArray<readonly [string, QaapVerifyCheckKind]> = [
    ['compile', 'build'],
    ['build', 'build'],
    ['test', 'test'],
    ['typecheck', 'typecheck'],
    ['lint', 'lint'],
];

export function buildVerifyRunCommand(script: string, packageManager: QaapVerifyPackageManager = 'npm'): string {
    switch (packageManager) {
        case 'pnpm':
            return `pnpm run ${script}`;
        case 'yarn':
            return `yarn ${script}`;
        case 'bun':
            return `bun run ${script}`;
        default:
            return `npm run ${script}`;
    }
}

export type QaapVerifyPackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/** Picks the first runnable npm script for post-turn verification. */
export function resolveVerifyCheckFromScripts(
    scripts: Record<string, unknown> | undefined,
    buildRunCommand: (script: string) => string = script => buildVerifyRunCommand(script),
): QaapResolvedVerifyCheck | undefined {
    if (!scripts || typeof scripts !== 'object') {
        return undefined;
    }
    for (const [script, kind] of VERIFY_SCRIPT_PRIORITY) {
        const value = scripts[script];
        if (typeof value === 'string' && value.trim().length > 0) {
            return {
                kind,
                script,
                command: buildRunCommand(script),
            };
        }
    }
    return undefined;
}
