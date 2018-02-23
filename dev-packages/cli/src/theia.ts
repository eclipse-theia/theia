/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as yargs from 'yargs';
import { ApplicationPackageTarget } from '@theia/application-package';
import { ApplicationPackageManager, rebuild } from '@theia/application-manager';

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

function rebuildCommand(command: string, target: ApplicationPackageTarget): yargs.CommandModule {
    return {
        command,
        describe: 'rebuild native node modules for the ' + target,
        handler: () => {
            const { modules } = yargs.array('modules').argv;
            try {
                rebuild(target, modules);
            } catch (err) {
                console.error(err);
                process.exit(1);
            }
        }
    };
}

const projectPath = process.cwd();
const manager = new ApplicationPackageManager({ projectPath });
const target = manager.pck.target;

yargs
    .command({
        command: 'start',
        describe: 'start the ' + manager.pck.target + ' backend',
        handler: async () => {
            try {
                await manager.start(commandArgs('start'));
            } catch (err) {
                console.error(err);
                process.exit(1);
            }
        }
    })
    .command({
        command: 'clean',
        describe: 'clean for the ' + target + ' target',
        handler: () => {
            try {
                manager.clean();
            } catch (err) {
                console.error(err);
                process.exit(1);
            }
        }
    })
    .command({
        command: 'copy',
        handler: () => {
            try {
                manager.copy();
            } catch (err) {
                console.error(err);
                process.exit(1);
            }
        }
    })
    .command({
        command: 'generate',
        handler: () => {
            try {
                manager.generate();
            } catch (err) {
                console.error(err);
                process.exit(1);
            }
        }
    })
    .command({
        command: 'build',
        describe: 'webpack the ' + target + ' frontend',
        handler: async () => {
            try {
                await manager.build(commandArgs('build'));
            } catch (err) {
                console.error(err);
                process.exit(1);
            }
        }
    })
    .command(rebuildCommand('rebuild', target))
    .command(rebuildCommand('rebuild:browser', 'browser'))
    .command(rebuildCommand('rebuild:electron', 'electron'));

// see https://github.com/yargs/yargs/issues/287#issuecomment-314463783
const commands = (yargs as any).getCommandInstance().getCommands();
const argv = yargs.demandCommand(1).argv;
const command = argv._[0];
if (!command || commands.indexOf(command) === -1) {
    console.log("non-existing or no command specified");
    yargs.showHelp();
    process.exit(1);
} else {
    yargs.help(false);
}
