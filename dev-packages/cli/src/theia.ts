/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// tslint:disable:no-console
import * as yargs from 'yargs';
import { ApplicationPackageTarget, ApplicationPackageManager, rebuild } from '@theia/application-package';

process.on('unhandledRejection', (reason, promise) => {
    throw reason;
});
process.on('uncaughtException', error => {
    if (error) {
        console.error('Uncaught Exception: ', error.toString());
        if (error.stack) {
            console.error(error.stack);
        }
    }
});

function commandArgs(arg: string): string[] {
    const restIndex = process.argv.indexOf(arg);
    return restIndex !== -1 ? process.argv.slice(restIndex + 1) : [];
}

function manager(target: ApplicationPackageTarget): ApplicationPackageManager {
    const projectPath = process.cwd();
    return new ApplicationPackageManager({ target, projectPath });
}

const targets: ApplicationPackageTarget[] = ['browser', 'electron'];
for (const target of targets) {
    yargs
        .command({
            command: target,
            describe: 'start the ' + target + ' target',
            handler: () => manager(target).start(commandArgs(target))
        })
        .command({
            command: 'rm:' + target,
            describe: 'clean for the ' + target + ' target',
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
            describe: 'webpack for the ' + target + ' target',
            handler: () => manager(target).build(commandArgs('build:' + target))
        })
        .command({
            command: 'rebuild:' + target,
            describe: 'rebuild native node modules for the ' + target + ' target',
            handler: () => {
                const { modules } = yargs.array('modules').argv;
                rebuild(target, modules);
            }
        });
}

// see https://github.com/yargs/yargs/issues/287#issuecomment-314463783
const commands = (yargs as any).getCommandInstance().getCommands();
const argv = yargs.demandCommand(1).argv;
const command = argv._[0];
if (!command || commands.indexOf(command) === -1) {
    console.log("non-existing or no command specified");
    yargs.showHelp();
    process.exit(1);
}
