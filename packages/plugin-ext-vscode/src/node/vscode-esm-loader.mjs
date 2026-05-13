// *****************************************************************************
// Copyright (C) 2025 EclipseSource and others.
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

/**
 * ESM loader hook for the plugin host process.
 *
 * VS Code extensions increasingly use ESM (`"type": "module"` in package.json).
 * Theia resolves `require('vscode')` via a CommonJS `module._load` override,
 * but ESM `import ... from 'vscode'` bypasses that entirely.
 *
 * This resolve hook intercepts `import 'vscode'` and redirects it to a small
 * `.cjs` shim file that calls `require('vscode')`, which goes through the
 * existing CJS `module._load` override in plugin-vscode-init.ts.
 *
 * Registered via `module.register()` in plugin-vscode-init.ts.
 */

import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const shimUrl = pathToFileURL(join(__dirname, 'vscode-esm-shim.cjs')).href;

/**
 * Intercept `import 'vscode'` and redirect to the CJS shim file.
 * The shim calls `require('vscode')` which is handled by the
 * `module._load` override in plugin-vscode-init.ts.
 */
export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'vscode') {
        return {
            shortCircuit: true,
            url: shimUrl
        };
    }
    return nextResolve(specifier, context);
}
