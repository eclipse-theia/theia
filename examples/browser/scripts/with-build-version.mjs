// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Runs a command with BUILD_VERSION set so the PWA service worker cache keys change on every
 * local production build (CI sets BUILD_VERSION / VERCEL_GIT_COMMIT_SHA automatically).
 */
import { spawnSync } from 'node:child_process';

const buildVersion = process.env.BUILD_VERSION?.trim() || `local-${Date.now()}`;
const [command, ...args] = process.argv.slice(2);
if (!command) {
    console.error('usage: node scripts/with-build-version.mjs <command> [args...]');
    process.exit(1);
}

const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, BUILD_VERSION: buildVersion },
    shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
