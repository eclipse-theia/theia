/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { Argv, Arguments } from '@theia/core/shared/yargs';
import { CliContribution } from '@theia/core/lib/node/cli';
import { LocalDirectoryPluginDeployerResolver } from './resolvers/local-directory-plugin-deployer-resolver';

@injectable()
export class PluginCliContribution implements CliContribution {

    static PLUGINS = 'plugins';
    static PLUGIN_MAX_SESSION_LOGS_FOLDERS = 'plugin-max-session-logs-folders';
    /**
     * This is the default value used in VSCode, see:
     * - https://github.com/Microsoft/vscode/blob/613447d6b3f458ef7fee227e3876303bf5184580/src/vs/code/electron-browser/sharedProcess/contrib/logsDataCleaner.ts#L32
     */
    static DEFAULT_PLUGIN_MAX_SESSION_LOGS_FOLDERS = 10;

    protected _localDir: string | undefined;
    protected _maxSessionLogsFolders: number;

    configure(conf: Argv): void {
        conf.option(PluginCliContribution.PLUGINS, {
            // eslint-disable-next-line max-len
            description: `Provides further refinement for the plugins. Example: --${PluginCliContribution.PLUGINS}=${LocalDirectoryPluginDeployerResolver.LOCAL_DIR}:path/to/your/plugins`,
            type: 'string',
            nargs: 1
        });

        const maxLogSessionExample = `Example: --${PluginCliContribution.PLUGIN_MAX_SESSION_LOGS_FOLDERS}=5`;
        conf.option(PluginCliContribution.PLUGIN_MAX_SESSION_LOGS_FOLDERS, {
            description: `The maximum number of plugin logs sessions folders to retain. ${maxLogSessionExample}`,
            type: 'number',
            default: PluginCliContribution.DEFAULT_PLUGIN_MAX_SESSION_LOGS_FOLDERS,
            nargs: 1
        });
    }

    setArguments(args: Arguments): void {
        const pluginsArg = args[PluginCliContribution.PLUGINS] as string;
        if (pluginsArg && String(pluginsArg).startsWith(`${LocalDirectoryPluginDeployerResolver.LOCAL_DIR}:`)) {
            this._localDir = pluginsArg;
        }

        const maxSessionLogsFoldersArg = args[PluginCliContribution.PLUGIN_MAX_SESSION_LOGS_FOLDERS] as number;
        if (maxSessionLogsFoldersArg && Number.isInteger(maxSessionLogsFoldersArg) && maxSessionLogsFoldersArg > 0) {
            this._maxSessionLogsFolders = maxSessionLogsFoldersArg;
        }
    }

    localDir(): string | undefined {
        return this._localDir;
    }

    maxSessionLogsFolders(): number {
        return this._maxSessionLogsFolders;
    }

}
