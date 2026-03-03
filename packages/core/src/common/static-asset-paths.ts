// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin.
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
 * Base path where hosted plugin resources (list.json, plugin assets) are served
 * from the app origin. Used by both the filesystem layer (to read static plugin
 * resources) and plugin-ext (copy, URLs). Defined in core so packages that cannot
 * depend on plugin-ext (e.g. filesystem) can still resolve plugin asset paths.
 */
export const PLUGINS_BASE_PATH = 'hostedPlugin';

/**
 * URI scheme for plugin static resources. Use this scheme (instead of `file`) when
 * building URIs that point under {@link PLUGINS_BASE_PATH}, so that other code can
 * recognize plugin resources by scheme and avoid treating them as local files.
 */
export const PLUGIN_RESOURCE_SCHEME = 'theia-plugin';
