/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as yargs from 'yargs';
import { injectable } from 'inversify';
import { CliContribution } from "@theia/core/lib/node";
import { ApplicationProjectOptions } from './application-project';
import { NpmClientOptions } from './npm-client';

export type ApplicationProjectArgs = ApplicationProjectOptions & NpmClientOptions;

const appProjectPath = 'app-project-path';
const appNpmClient = 'app-npm-client';
const appAutoInstall = 'app-auto-install';
const appWatchRegistry = 'app-watch-registry';

@injectable()
export class ApplicationProjectCliContribution implements CliContribution {

    protected _args: ApplicationProjectArgs;
    get args(): ApplicationProjectArgs {
        return this._args;
    }

    configure(conf: yargs.Argv): void {
        conf.option(appProjectPath, {
            description: "Sets the application project directory",
            default: process.cwd()
        });
        conf.option(appNpmClient, {
            description: "Sets the application npm client",
            choices: ["npm", "yarn"],
            default: "yarn"
        });
        conf.option(appAutoInstall, {
            description: "Sets whether the application should be build on package.json changes",
            type: "boolean",
            default: true
        });
        conf.option(appWatchRegistry, {
            type: "boolean",
            default: true
        });
    }

    setArguments(args: yargs.Arguments): void {
        this._args = {
            projectPath: args[appProjectPath],
            npmClient: args[appNpmClient],
            autoInstall: args[appAutoInstall],
            watchRegistry: args[appWatchRegistry]
        };
    }

}
