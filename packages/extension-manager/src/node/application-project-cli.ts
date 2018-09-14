/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import * as yargs from 'yargs';
import { injectable, inject } from 'inversify';
import { CliContribution, BackendApplicationCliContribution } from '@theia/core/lib/node';
import { ApplicationProjectOptions } from './application-project';
import { NpmClientOptions } from './npm-client';

export type ApplicationProjectArgs = ApplicationProjectOptions & NpmClientOptions;

const appNpmClient = 'app-npm-client';
const appAutoInstall = 'app-auto-install';
const appWatchRegistry = 'app-watch-registry';

@injectable()
export class ApplicationProjectCliContribution implements CliContribution {

    @inject(BackendApplicationCliContribution)
    protected readonly applicationCli: BackendApplicationCliContribution;

    protected _args: ApplicationProjectArgs;
    get args(): ApplicationProjectArgs {
        return this._args;
    }

    configure(conf: yargs.Argv): void {
        conf.option(appNpmClient, {
            description: 'Sets the application npm client',
            choices: ['npm', 'yarn'],
            default: 'yarn'
        });
        conf.option(appAutoInstall, {
            description: 'Sets whether the application should be build on package.json changes',
            type: 'boolean',
            default: true
        });
        conf.option(appWatchRegistry, {
            type: 'boolean',
            default: true
        });
    }

    setArguments(args: yargs.Arguments): void {
        const { projectPath } = this.applicationCli;
        this._args = {
            projectPath,
            npmClient: args[appNpmClient],
            autoInstall: args[appAutoInstall],
            watchRegistry: args[appWatchRegistry]
        };
    }

}
