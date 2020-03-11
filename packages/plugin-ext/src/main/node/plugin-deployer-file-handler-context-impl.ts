/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { PluginDeployerEntry, PluginDeployerFileHandlerContext } from '../../common/plugin-protocol';
import * as decompress from 'decompress';

export class PluginDeployerFileHandlerContextImpl implements PluginDeployerFileHandlerContext {

    /**
     * For testing: set to false to disable zip-slip prevention.
     */
    private _safeUnzip = true;

    constructor(private readonly pluginDeployerEntry: PluginDeployerEntry) {

    }

    async unzip(sourcePath: string, destPath: string): Promise<void> {
        const absoluteDestPath = path.resolve(process.cwd(), destPath);
        await decompress(sourcePath, absoluteDestPath, {
            /**
             * Prevent zip-slip: https://snyk.io/research/zip-slip-vulnerability
             */
            filter: (file: decompress.File) => {
                if (this._safeUnzip) {
                    const expectedFilePath = path.join(absoluteDestPath, file.path);
                    // If dest is not found in the expected path, it means file will be unpacked somewhere else.
                    if (!expectedFilePath.startsWith(path.join(absoluteDestPath, path.sep))) {
                        throw new Error(`Detected a zip-slip exploit in archive "${sourcePath}"\n` +
                            `  File "${file.path}" was going to write to "${expectedFilePath}"\n` +
                            '  See: https://snyk.io/research/zip-slip-vulnerability');
                    }
                }
                return true;
            }
        });
    }

    pluginEntry(): PluginDeployerEntry {
        return this.pluginDeployerEntry;
    }
}
