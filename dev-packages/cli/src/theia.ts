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

import * as temp from 'temp';
import * as yargs from 'yargs';
import yargsFactory = require('yargs/yargs');
import { ApplicationPackageManager, rebuild } from '@theia/application-manager';
import { ApplicationProps } from '@theia/application-package';
import checkHoisted from './check-hoisting';
import downloadPlugins from './download-plugins';
import runTest from './run-test';

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
    process.exit(1);
});
theiaCli();

function getCommandArgv(argv: (string | number)[]): string[] {
    return argv.slice(1).map(arg => typeof arg === 'string' ? arg : arg.toString(10));
}

function rebuildCommand(command: string, target: ApplicationProps.Target): yargs.CommandModule<unknown, { modules: string[] }> {
    return {
        command,
        describe: 'rebuild native node modules for the ' + target,
        builder: {
            'modules': {
                array: true,
            },
        },
        handler: args => {
            rebuild(target, args.modules);
        }
    };
}

function defineCommonOptions<T>(cli: yargs.Argv<T>): yargs.Argv<T & {
    'app-target'?: 'browser' | 'electron'
}> {
    return cli
        .option('app-target', {
            description: 'The target application type. Overrides `theia.target` in the application\'s package.json',
            choices: ['browser', 'electron'] as const,
        });
}

function theiaCli(): void {
    const projectPath = process.cwd();
    // Create a sub `yargs` parser to read `app-target` without
    // affecting the global `yargs` instance used by the CLI.
    const {
        'app-target': appTarget,
    } = defineCommonOptions(yargsFactory())
        .help(false)
        .parse();
    const manager = new ApplicationPackageManager({
        projectPath,
        appTarget
    });
    const { target } = manager.pck;
    const parsed = defineCommonOptions(yargs)
        .command({
            command: 'start',
            describe: `Start the ${target} backend`,
            handler: async argv => {
                manager.start(getCommandArgv(argv._));
            }
        })
        .command({
            command: 'clean',
            describe: `Clean for the ${target} target`,
            handler: async () => {
                await manager.clean();
            }
        })
        .command({
            command: 'copy',
            describe: 'Copy various files from `src-gen` to `lib`',
            handler: async () => {
                await manager.copy();
            }
        })
        .command<{
            'mode': 'development' | 'production',
            'split-frontend'?: boolean
        }>({
            command: 'generate',
            describe: `Generate various files for the ${target} target`,
            builder: cli => ApplicationPackageManager.defineGeneratorOptions(cli),
            handler: async argv => {
                await manager.generate({
                    mode: argv.mode,
                    splitFrontend: argv['split-frontend']
                });
            }
        })
        .command<{
            'mode': 'development' | 'production',
            'split-frontend'?: boolean
        }>({
            command: 'build',
            describe: `Generate and bundle the ${target} frontend using webpack`,
            builder: cli => ApplicationPackageManager.defineGeneratorOptions(cli),
            handler: async argv => {
                console.log('AAAAAAAAAA', argv._);
                await manager.build(getCommandArgv(argv._), {
                    mode: argv.mode,
                    splitFrontend: argv['split-frontend']
                });
            }
        })
        .command(rebuildCommand('rebuild', target))
        .command(rebuildCommand('rebuild:browser', 'browser'))
        .command(rebuildCommand('rebuild:electron', 'electron'))
        .command<{ suppress: boolean }>({
            command: 'check:hoisted',
            describe: 'Check that all dependencies are hoisted',
            builder: {
                'suppress': {
                    alias: 's',
                    describe: 'Suppress exiting with failure code',
                    boolean: true,
                    default: false
                }
            },
            handler: argv => {
                checkHoisted(argv);
            }
        })
        .command<{ packed: boolean }>({
            command: 'download:plugins',
            describe: 'Download defined external plugins',
            builder: {
                'packed': {
                    alias: 'p',
                    describe: 'Controls whether to pack or unpack plugins',
                    boolean: true,
                    default: false,
                },
                'ignore-errors': {
                    alias: 'i',
                    describe: 'Ignore errors while downloading plugins',
                    boolean: true,
                    default: false,
                },
                'api-version': {
                    alias: 'v',
                    describe: 'Supported API version for plugins',
                    default: '1.50.0'
                },
                'api-url': {
                    alias: 'u',
                    describe: 'Open-VSX Registry API URL',
                    default: 'https://open-vsx.org/api'
                }
            },
            handler: async argv => {
                await downloadPlugins(argv);
            },
        }).command<{
            testInspect: boolean,
            testExtension: string[],
            testFile: string[],
            testIgnore: string[],
            testRecursive: boolean,
            testSort: boolean,
            testSpec: string[],
            testCoverage: boolean
        }>({
            command: 'test',
            builder: {
                'test-inspect': {
                    describe: 'Whether to auto-open a DevTools panel for test page.',
                    boolean: true,
                    default: false
                },
                'test-extension': {
                    describe: 'Test file extension(s) to load',
                    array: true,
                    default: ['js']
                },
                'test-file': {
                    describe: 'Specify test file(s) to be loaded prior to root suite execution',
                    array: true,
                    default: []
                },
                'test-ignore': {
                    describe: 'Ignore test file(s) or glob pattern(s)',
                    array: true,
                    default: []
                },
                'test-recursive': {
                    describe: 'Look for tests in subdirectories',
                    boolean: true,
                    default: false
                },
                'test-sort': {
                    describe: 'Sort test files',
                    boolean: true,
                    default: false
                },
                'test-spec': {
                    describe: 'One or more test files, directories, or globs to test',
                    array: true,
                    default: ['test']
                },
                'test-coverage': {
                    describe: 'Report test coverage consumable by istanbul',
                    boolean: true,
                    default: false
                }
            },
            handler: async ({ _, testInspect, testExtension, testFile, testIgnore, testRecursive, testSort, testSpec, testCoverage }) => {
                if (!process.env.THEIA_CONFIG_DIR) {
                    process.env.THEIA_CONFIG_DIR = temp.track().mkdirSync('theia-test-config-dir');
                }
                await runTest({
                    start: () => new Promise((resolve, reject) => {
                        const serverProcess = manager.start(getCommandArgv(_));
                        serverProcess.on('message', resolve);
                        serverProcess.on('error', reject);
                        serverProcess.on('close', code => reject(`Server process exited unexpectedly with ${code} code`));
                    }),
                    launch: {
                        args: ['--no-sandbox'],
                        devtools: testInspect
                    },
                    files: {
                        extension: testExtension,
                        file: testFile,
                        ignore: testIgnore,
                        recursive: testRecursive,
                        sort: testSort,
                        spec: testSpec
                    },
                    coverage: testCoverage
                });
            }
        })
        .parserConfiguration({
            'unknown-options-as-args': true,
        })
        .demandCommand(1, 'Please run a command')
        .parse();

    // see https://github.com/yargs/yargs/issues/287#issuecomment-314463783
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commands = (yargs as any).getCommandInstance().getCommands();
    const command = parsed._[0];
    if (!command || commands.indexOf(command) === -1) {
        process.exitCode = 1;
        console.log(`Unknown command: ${command}`);
        yargs.showHelp();
    }
}
