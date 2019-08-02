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
import { ApplicationPackageManager, rebuild } from '@theia/application-manager';
import { ApplicationProps } from '@theia/application-package';
import checkHoisted from './check-hoisting';

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

function rebuildCommand(command: string, target: ApplicationProps.Target): yargs.CommandModule {
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

(function (): void {
    const projectPath = process.cwd();
    const appTarget: ApplicationProps.Target = yargs.argv['app-target'];
    const manager = new ApplicationPackageManager({ projectPath, appTarget });
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
        .command(rebuildCommand('rebuild:electron', 'electron'))
        .command({
            command: 'check:hoisted',
            describe: 'check that all dependencies are hoisted',
            builder: {
                'suppress': {
                    alias: 's',
                    describe: 'suppress exiting with failure code',
                    boolean: true,
                    default: false
                }
            },
            handler: args => {
                try {
                    checkHoisted(args);
                } catch (err) {
                    console.error(err);
                    process.exit(1);
                }
            }
        });

    // see https://github.com/yargs/yargs/issues/287#issuecomment-314463783
    // tslint:disable-next-line:no-any
    const commands = (yargs as any).getCommandInstance().getCommands();
    const argv = yargs.demandCommand(1).argv;
    const command = argv._[0];
    if (!command || commands.indexOf(command) === -1) {
        console.log('non-existing or no command specified');
        yargs.showHelp();
        process.exit(1);
    } else {
        yargs.help(false);
    }
})();
