// *****************************************************************************
// Copyright (C) 2026 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as fs from 'fs';
import * as paths from 'path';

/**
 * Name of the environment variable read from the application directory `.env` file
 * to override the frontend `applicationName` and `applicationIcon` from application props.
 */
export const IDE_APPLICATION_NAME_ENV = 'IDE_APPLICATION_NAME';

/**
 * URL or path for the branding icon, read from the application `.env` file
 * (maps to `FrontendApplicationConfig.applicationIcon`).
 */
export const IDE_APPLICATION_ICON_ENV = 'IDE_APPLICATION_ICON';

/**
 * Loads key/value pairs from a `.env` file next to the application `package.json`
 * into `process.env` when the key is not already defined (shell wins).
 */
export function applyLocalEnvFile(projectPath: string): void {
    const envPath = paths.join(projectPath, '.env');
    if (!fs.existsSync(envPath)) {
        return;
    }
    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split('\n')) {
        const line = rawLine.replace(/^\uFEFF/, '').trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        const eq = line.indexOf('=');
        if (eq <= 0) {
            continue;
        }
        const key = line.slice(0, eq).trim();
        if (!key || process.env[key] !== undefined) {
            continue;
        }
        let value = line.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
            (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
        ) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
}
