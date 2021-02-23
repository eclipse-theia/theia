/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import * as path from 'path';
import { URI as Uri } from '@theia/core/shared/vscode-uri';
import { IconUrl, PluginPackage } from '../common/plugin-protocol';
import { Plugin } from '../common/plugin-api-rpc';

export type PluginIconPath = string | Uri | {
    light: string | Uri,
    dark: string | Uri
};
export namespace PluginIconPath {
    export function toUrl(iconPath: PluginIconPath | undefined, plugin: Plugin): IconUrl | undefined {
        if (!iconPath) {
            return undefined;
        }
        if (typeof iconPath === 'object' && 'light' in iconPath) {
            return {
                light: asString(iconPath.light, plugin),
                dark: asString(iconPath.dark, plugin)
            };
        }
        return asString(iconPath, plugin);
    }
    export function asString(arg: string | Uri, plugin: Plugin): string {
        arg = arg instanceof Uri && arg.scheme === 'file' ? arg.fsPath : arg;
        if (typeof arg !== 'string') {
            return arg.toString(true);
        }
        const { packagePath } = plugin.rawModel;
        const absolutePath = path.isAbsolute(arg) ? arg : path.join(packagePath, arg);
        const normalizedPath = path.normalize(absolutePath);
        const relativePath = path.relative(packagePath, normalizedPath);
        return PluginPackage.toPluginUrl(plugin.rawModel, relativePath);
    }
}
