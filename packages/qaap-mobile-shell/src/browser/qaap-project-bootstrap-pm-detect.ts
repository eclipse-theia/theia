// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { QaapPackageManager } from './qaap-project-bootstrap-types';

const DECLARED_PM = /^(npm|pnpm|yarn|bun)(?:@.+)?$/i;

/** Parses Corepack `packageManager` field values (`pnpm@9.0.0`, `pnpm`, …). */
export function parseDeclaredPackageManager(declared: string): QaapPackageManager | undefined {
    const trimmed = declared.trim();
    if (!trimmed) {
        return undefined;
    }
    const match = DECLARED_PM.exec(trimmed);
    if (!match) {
        return undefined;
    }
    return match[1].toLowerCase() as QaapPackageManager;
}

/** Reads `package-manager=pnpm` from an `.npmrc` fragment. */
export function parseNpmrcPackageManager(content: string): QaapPackageManager | undefined {
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || line.startsWith(';')) {
            continue;
        }
        const match = /^package-manager\s*=\s*(npm|pnpm|yarn|bun)\b/i.exec(line);
        if (match) {
            return match[1].toLowerCase() as QaapPackageManager;
        }
    }
    return undefined;
}

/**
 * Minimal YAML reader for `pnpm-workspace.yaml` `packages` entries (quoted globs, exclusions).
 */
export function parsePnpmWorkspaceYaml(content: string): string[] {
    const lines = content.split(/\r?\n/);
    const patterns: string[] = [];
    let inPackages = false;
    for (const rawLine of lines) {
        const line = rawLine.replace(/#.*$/, '').trimEnd();
        if (!line.trim()) {
            continue;
        }
        const topLevel = /^([A-Za-z_][\w-]*):\s*$/.exec(line);
        if (topLevel) {
            inPackages = topLevel[1] === 'packages';
            continue;
        }
        if (!inPackages) {
            continue;
        }
        const item = /^\s*-\s*(?:"([^"]*)"|'([^']*)'|([^#\s]+))\s*$/.exec(line);
        if (!item) {
            continue;
        }
        const pattern = (item[1] ?? item[2] ?? item[3]).trim();
        if (pattern.length > 0 && !pattern.startsWith('!')) {
            patterns.push(pattern);
        }
    }
    return patterns;
}
