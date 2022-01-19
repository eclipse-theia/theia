/********************************************************************************
 * Copyright (C) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as theia from '@theia/plugin';

export enum ExtensionKind {
    UI = 1,
    Workspace = 2
}

export interface VsCodeExtension<T> extends theia.Plugin<T> {
    readonly extensionUri: theia.Uri;
    readonly extensionPath: string;
    extensionKind: ExtensionKind;
}

export interface VsCodeExtensionContext extends theia.PluginContext {
    readonly extension: VsCodeExtension<any>;
}

export function asVsCodeExtension<T>(plugin: theia.Plugin<T> | undefined): VsCodeExtension<T> | undefined {
    return plugin && Object.assign(plugin, {
        extensionPath: plugin.pluginPath,
        extensionUri: plugin.pluginUri,
        extensionKind: ExtensionKind.UI // stub as a local VS Code extension (not running on a remote workspace)
    });
}
