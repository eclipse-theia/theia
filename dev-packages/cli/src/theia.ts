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

function toStringArray(argv: (string | number)[]): string[];
function toStringArray(argv?: (string | number)[]): string[] | undefined;
function toStringArray(argv?: (string | number)[]): string[] | undefined {
    return argv === undefined
        ? undefined
        : argv.map(arg => String(arg));
}

function rebuildCommand(command: string, target: ApplicationProps.Target): yargs.CommandModule<unknown, { modules: string[], cacheRoot?: string }> {
    return {
        command,
        describe: `Rebuild/revert native node modules for "${target}"`,
        builder: {
            'cacheRoot': {
                type: 'string',
                describe: 'Root folder where to store the .browser_modules cache'
            },
            'modules': {
                array: true,
                describe: 'List of modules to rebuild/revert'
            },
        },
        handler: ({ cacheRoot, modules }) => {
            rebuild(target, { cacheRoot, modules });
        }
    };
}

function defineCommonOptions<T>(cli: yargs.Argv<T>): yargs.Argv<T & {
    appTarget?: 'browser' | 'electron'
}> {
    return cli
        .option('app-target', {
            description: 'The target application type. Overrides `theia.target` in the application\'s package.json',
            choices: ['browser', 'electron'] as const,
        });
}

function theiaCli(): void {
    const projectPath = process.cwd();
    yargs.scriptName('theia').version(require('../package.json').version);
    // Create a sub `yargs` parser to read `app-target` without
    // affecting the global `yargs` instance used by the CLI.
    const { appTarget } = defineCommonOptions(yargsFactory()).help(false).parse();
    const manager = new ApplicationPackageManager({ projectPath, appTarget });
    const { target } = manager.pck;
    defineCommonOptions(yargs)
        .command<{
            theiaArgs?: (string | number)[]
        }>({
            command: 'start [theia-args...]',
            describe: `Start the ${target} backend`,
            // Disable this command's `--help` option so that it is forwarded to Theia's CLI
            builder: cli => cli.help(false) as yargs.Argv,
            handler: async ({ theiaArgs }) => {
                manager.start(toStringArray(theiaArgs));
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
            mode: 'development' | 'production',
            splitFrontend?: boolean
        }>({
            command: 'generate',
            describe: `Generate various files for the ${target} target`,
            builder: cli => ApplicationPackageManager.defineGeneratorOptions(cli),
            handler: async ({ mode, splitFrontend }) => {
                await manager.generate({ mode, splitFrontend });
            }
        })
        .command<{
            mode: 'development' | 'production',
            webpackHelp: boolean
            splitFrontend?: boolean
            webpackArgs?: (string | number)[]
        }>({
            command: 'build [webpack-args...]',
            describe: `Generate and bundle the ${target} frontend using webpack`,
            builder: cli => ApplicationPackageManager.defineGeneratorOptions(cli)
                .option('webpack-help' as 'webpackHelp', {
                    boolean: true,
                    description: 'Display Webpack\'s help',
                    default: false
                }),
            handler: async ({ mode, splitFrontend, webpackHelp, webpackArgs = [] }) => {
                await manager.build(
                    webpackHelp
                        ? ['--help']
                        : [
                            // Forward the `mode` argument to Webpack too:
                            '--mode', mode,
                            ...toStringArray(webpackArgs)
                        ],
                    { mode, splitFrontend }
                );
            }
        })
        .command(rebuildCommand('rebuild', target))
        .command(rebuildCommand('rebuild:browser', 'browser'))
        .command(rebuildCommand('rebuild:electron', 'electron'))
        .command<{
            suppress: boolean
        }>({
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
            handler: ({ suppress }) => {
                checkHoisted({ suppress });
            }
        })
        .command<{
            packed: boolean
        }>({
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
            handler: async ({ packed }) => {
                await downloadPlugins({ packed });
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
            theiaArgs?: (string | number)[]
        }>({
            command: 'test [theia-args...]',
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
            handler: async ({ testInspect, testExtension, testFile, testIgnore, testRecursive, testSort, testSpec, testCoverage, theiaArgs }) => {
                if (!process.env.THEIA_CONFIG_DIR) {
                    process.env.THEIA_CONFIG_DIR = temp.track().mkdirSync('theia-test-config-dir');
                }
                await runTest({
                    start: () => new Promise((resolve, reject) => {
                        const serverProcess = manager.start(toStringArray(theiaArgs));
                        serverProcess.on('message', resolve);
                        serverProcess.on('error', reject);
                        serverProcess.on('close', (code, signal) => reject(`Server process exited unexpectedly: ${code ?? signal}`));
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
        .strictCommands()
        .demandCommand(1, 'Please run a command')
        .fail((msg, err, cli) => {
            process.exitCode = 1;
            if (err) {
                // One of the handlers threw an error:
                console.error(err);
            } else {
                // Yargs detected a problem with commands and/or arguments while parsing:
                cli.showHelp();
                console.error(msg);
            }
        })
        .parse();
}
