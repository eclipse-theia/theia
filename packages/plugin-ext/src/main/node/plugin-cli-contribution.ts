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

import { injectable } from 'inversify';
import { Argv, Arguments } from 'yargs';
import { CliContribution } from '@theia/core/lib/node/cli';
import { LocalDirectoryPluginDeployerResolver } from './resolvers/plugin-local-dir-resolver';

@injectable()
export class PluginCliContribution implements CliContribution {

    static PLUGINS = 'plugins';

    protected _localDir: string | undefined;

    configure(conf: Argv): void {
        conf.option(PluginCliContribution.PLUGINS, {
            // tslint:disable-next-line:max-line-length
            description: `Provides further refinement for the plugins. Example: --${PluginCliContribution.PLUGINS}=${LocalDirectoryPluginDeployerResolver.LOCAL_DIR}:path/to/your/plugins`,
            type: 'string',
            nargs: 1
        });
    }

    setArguments(args: Arguments): void {
        const arg = args[PluginCliContribution.PLUGINS];
        if (arg && String(arg).startsWith(`${LocalDirectoryPluginDeployerResolver.LOCAL_DIR}:`)) {
            this._localDir = arg;
        }
    }

    localDir(): string | undefined {
        return this._localDir;
    }

}
