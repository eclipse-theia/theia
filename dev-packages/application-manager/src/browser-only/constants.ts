// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

/** Base path for hosted plugin assets; must match `static-asset-paths.ts` in the Theia core package. */
export const PLUGINS_BASE_PATH = 'hostedPlugin';

export const UNPUBLISHED = '<unpublished>';

/** Default folder name when `theiaPluginsDir` is not set in a parent `package.json`. */
export const DEFAULT_PLUGINS_DIR = 'plugins';

/** Output file next to copied plugin folders. */
export const LIST_JSON = 'list.json';

/** Strip this prefix from builtin extension package names (aligned with Theia builtins). */
export const VSCODE_BUILTIN_NAME_PREFIX = '@theia/vscode-builtin-';

/** Bundled VS Code–compat frontend init script (see webpack-generator). */
export const VSCODE_FRONTEND_INIT = 'plugin-vscode-init-fe.js';

/** Theia hosted plugin worker start/stop (aligned with plugin host). */
export const THEIA_PLUGIN_START_METHOD = 'start';
export const THEIA_PLUGIN_STOP_METHOD = 'stop';

/** VS Code extension activate/deactivate. */
export const VSCODE_EXTENSION_ACTIVATE = 'activate';
export const VSCODE_EXTENSION_DEACTIVATE = 'deactivate';

/** `fs.copy` filter: skip VCS and dependencies inside plugin trees. */
export const PLUGIN_COPY_IGNORE = /[/\\](\.git|node_modules)([/\\]|$)/;
