/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as yargs from 'yargs';
import { inject, named, injectable } from 'inversify';
import { ContributionProvider } from '../common/contribution-provider';

export const CliContribution = Symbol('CliContribution');

/**
 * Call back for extension to contribute options to the cli.
 */
export interface CliContribution {

    configure(conf: yargs.Argv): void;

    setArguments(args: yargs.Arguments): void;
}

@injectable()
export class CliManager {

    constructor( @inject(ContributionProvider) @named(CliContribution)
    protected readonly contributionsProvider: ContributionProvider<CliContribution>) { }

    initializeCli(): void {
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
            .parse(this.getArgs());
        for (const contrib of this.contributionsProvider.getContributions()) {
            contrib.setArguments(args);
        }
    }

    protected getArgs() {
        return process.argv;
    }

    protected isExit(): boolean {
        return true;
    }
}
