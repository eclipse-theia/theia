// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
import * as fs from '@theia/core/shared/fs-extra';
import { PluginIdentifiers, PluginPackage } from '../../common';
import { updateActivationEvents } from './plugin-activation-events';

export async function loadManifest(pluginPath: string): Promise<PluginPackage> {
    const manifest = await fs.readJson(path.join(pluginPath, 'package.json'));
    // translate vscode builtins, as they are published with a prefix. See https://github.com/theia-ide/vscode-builtin-extensions/blob/master/src/republish.js#L50
    const built_prefix = '@theia/vscode-builtin-';
    if (manifest && manifest.name && manifest.name.startsWith(built_prefix)) {
        manifest.name = manifest.name.substring(built_prefix.length);
    }
    manifest.publisher ??= PluginIdentifiers.UNPUBLISHED;
    updateActivationEvents(manifest);
    return manifest;
}
