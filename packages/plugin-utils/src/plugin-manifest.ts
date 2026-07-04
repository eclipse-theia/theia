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

import * as path from 'path';
import * as fs from 'fs-extra';
import { UNPUBLISHED, VSCODE_BUILTIN_NAME_PREFIX } from './constants';
import type { PluginManifest } from './manifest-types';
import { updateActivationEvents } from './plugin-activation-events';

export interface PrepareLoadedManifestOptions {
    /** @default true */
    updateActivationEvents?: boolean;
}

type LoadedManifest = Pick<PluginManifest, 'name' | 'publisher' | 'contributes' | 'activationEvents'>;

/** Strip `@theia/vscode-builtin-` from builtin extension package names. */
export function stripVscodeBuiltinNamePrefix(manifest: Pick<PluginManifest, 'name'>): void {
    if (manifest?.name?.startsWith(VSCODE_BUILTIN_NAME_PREFIX)) {
        manifest.name = manifest.name.substring(VSCODE_BUILTIN_NAME_PREFIX.length);
    }
}

/** Apply shared post-load fixes to a manifest read from `package.json`. */
export function prepareLoadedManifest<T extends LoadedManifest>(
    manifest: T,
    options?: PrepareLoadedManifestOptions
): T {
    stripVscodeBuiltinNamePrefix(manifest);
    manifest.publisher ??= UNPUBLISHED;
    if (options?.updateActivationEvents !== false) {
        updateActivationEvents(manifest);
    }
    return manifest;
}

/** Read `package.json` from a plugin directory and apply {@link prepareLoadedManifest}. */
export async function loadManifest<T extends LoadedManifest = PluginManifest>(
    pluginPath: string,
    options?: PrepareLoadedManifestOptions
): Promise<T> {
    const manifest = await fs.readJson(path.join(pluginPath, 'package.json')) as T;
    return prepareLoadedManifest(manifest, options);
}
