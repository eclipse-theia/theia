/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as yargs from 'yargs';
import { injectable } from 'inversify';
import { CliContribution } from "@theia/core/lib/node";

const metricsProjectPath = 'metrics-project-path';

@injectable()
export class MetricsCliContribution implements CliContribution {

    applicationPath: string;

    configure(conf: yargs.Argv): void {
        conf.option(metricsProjectPath, {
            description: "Sets the application project directory (used in metrics extension)",
            default: process.cwd()
        });
    }

    setArguments(args: yargs.Arguments): void {
        this.applicationPath = args[metricsProjectPath];
    }

}
