// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { QaapPackageManager } from './qaap-project-bootstrap-types';

/**
 * Install command for project bootstrap. Docker / production hosts often set
 * `NODE_ENV=production`, which makes npm/yarn/pnpm skip `devDependencies` — but dev
 * servers (Vite, Next, esbuild, …) live there. We force a development install.
 */
export function buildBootstrapInstallCommand(pm: QaapPackageManager): string {
    const env = 'NODE_ENV=development';
    switch (pm) {
        case 'pnpm':
            return `${env} pnpm install`;
        case 'yarn':
            return `${env} yarn install`;
        case 'bun':
            return `${env} bun install`;
        default:
            // `--include=dev` still applies when npm honors production omit via config.
            return `${env} npm install --include=dev`;
    }
}
