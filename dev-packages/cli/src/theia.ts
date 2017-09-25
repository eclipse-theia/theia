/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as yargs from 'yargs';
import { ApplicationPackageTarget, ApplicationPackageManager, rebuild } from '@theia/application-package';

function commandArgs(arg: string): string[] {
    const restIndex = process.argv.indexOf(arg);
    return restIndex !== -1 ? process.argv.slice(restIndex + 1) : [];
}

function manager(target: ApplicationPackageTarget): ApplicationPackageManager {
    const projectPath = process.cwd();
    return new ApplicationPackageManager({ target, projectPath });
}

let args = yargs
    .command({
        command: 'browser',
        handler: () => manager('browser').start(commandArgs('browser'))
    })
    .command({
        command: 'electron',
        handler: () => manager('electron').start(commandArgs('electron'))
    });

const targets: ApplicationPackageTarget[] = ['browser', 'electron'];
for (const target of targets) {
    args = args
        .command({
            command: 'rm:' + target,
            handler: () => manager(target).clean()
        })
        .command({
            command: 'cp:' + target,
            handler: () => manager(target).copy()
        })
        .command({
            command: 'gen:' + target,
            handler: () => manager(target).generate()
        })
        .command({
            command: 'build:' + target,
            handler: () => manager(target).build(commandArgs('build:' + target))
        })
        .command({
            command: 'rebuild:' + target,
            handler: () => {
                const { modules } = yargs.array('modules').argv;
                rebuild(target, modules);
            }
        });
}

// tslint:disable-next-line:no-unused-expression
args.demandCommand(1).argv;
