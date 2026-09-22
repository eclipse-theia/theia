// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

// @ts-check

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Writes the given files into a fresh temporary directory, so that a test needing a specific
 * package layout neither depends on the real repository nor on the other tests. A fresh directory
 * per call also matters because a malformed package.json is only reported once per path.
 * Linted files themselves do not have to exist, only the package.json files a rule resolves.
 * @param {{[relativePath: string]: string}} files
 */
function tempFiles(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theia-eslint-plugin-'));
    for (const [relativePath, content] of Object.entries(files)) {
        const file = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
    }
    return {
        /** @param {string} relativePath */
        resolve: relativePath => path.join(root, relativePath),
        dispose: () => fs.rmSync(root, { recursive: true, force: true })
    };
}

module.exports = { tempFiles };
