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
 * CJS shim for ESM plugins that `import 'vscode'`.
 *
 * The ESM loader hook (vscode-esm-loader.mjs) redirects `import 'vscode'`
 * to this file. This `require('vscode')` call goes through the `module._load`
 * override in plugin-vscode-init.ts, which returns the correct plugin API.
 *
 * The plugin host sets `global.__theia_esm_plugin_folder` before loading
 * an ESM plugin so that `findPlugin` in plugin-vscode-init.ts can identify
 * the requesting plugin (since this shim's filename is not inside any
 * plugin directory).
 */
module.exports = require('vscode');
