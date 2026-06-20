// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

// ESM loader hooks to handle non-JS file extensions (e.g. .css) that
// are imported by ESM dependencies such as @theia/monaco-editor-core.
// Without this, Node's ESM resolver throws ERR_UNKNOWN_FILE_EXTENSION
// which causes mocha's import-then-require fallback to partially execute
// test files before retrying, leading to duplicate side effects.

const STYLE_EXTENSIONS = ['.css', '.scss', '.sass', '.less'];

export function resolve(specifier, context, nextResolve) {
    return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
    if (STYLE_EXTENSIONS.some(ext => url.endsWith(ext))) {
        return { format: 'module', source: 'export default {};', shortCircuit: true };
    }
    return nextLoad(url, context);
}
