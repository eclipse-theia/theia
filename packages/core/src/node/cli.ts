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
import { inject, named, injectable } from 'inversify';
import { ContributionProvider } from '../common/contribution-provider';
import { MaybePromise } from '../common/types';

export const CliContribution = Symbol('CliContribution');

/**
 * Call back for extension to contribute options to the cli.
 */
export interface CliContribution {
    configure(conf: yargs.Argv): void;
    setArguments(args: yargs.Arguments): MaybePromise<void>;
}

@injectable()
export class CliManager {

    constructor(@inject(ContributionProvider) @named(CliContribution)
    protected readonly contributionsProvider: ContributionProvider<CliContribution>) { }

    async initializeCli(argv: string[]): Promise<void> {
        const pack = require('../../package.json');
        const version = pack.version;
        const command = yargs.version(version);
        command.exitProcess(this.isExit());
        for (const contrib of this.contributionsProvider.getContributions()) {
            contrib.configure(command);
        }
        const args = command
            .detectLocale(false)
            .showHelpOnFail(false, 'Specify --help for available options')
            .help('help')
            .parse(argv);
        for (const contrib of this.contributionsProvider.getContributions()) {
            await contrib.setArguments(args);
        }
    }

    protected isExit(): boolean {
        return true;
    }
}
