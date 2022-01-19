// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as fs from 'fs';
import * as path from 'path';
import * as temp from 'temp';
import * as yargs from 'yargs';
import yargsFactory = require('yargs/yargs');
import { ApplicationPackageManager, rebuild } from '@theia/application-manager';
import { ApplicationProps, DEFAULT_SUPPORTED_API_VERSION } from '@theia/application-package';
import * as ffmpeg from '@theia/ffmpeg';
import checkHoisted from './check-hoisting';
import downloadPlugins from './download-plugins';
import runTest from './run-test';
import { LocalizationManager, extract } from '@theia/localization-manager';

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

function rebuildCommand(command: string, target: ApplicationProps.Target): yargs.CommandModule<unknown, {
    modules: string[]
    cacheRoot?: string
    forceAbi?: number,
}> {
    return {
        command,
        describe: `Rebuild/revert native node modules for "${target}"`,
        builder: {
            'cacheRoot': {
                type: 'string',
                describe: 'Root folder where to store the .browser_modules cache'
            },
            'modules': {
                alias: 'm',
                type: 'array', // === `--modules/-m` can be specified multiple times
                describe: 'List of modules to rebuild/revert'
            },
            'forceAbi': {
                type: 'number',
                describe: 'The Node ABI version to rebuild for'
            }
        },
        handler: ({ cacheRoot, modules, forceAbi }) => {
            // Note: `modules` is actually `string[] | undefined`.
            if (modules) {
                // It is ergonomic to pass arguments as --modules="a,b,c,..."
                // but yargs doesn't parse it this way by default.
                const flattened: string[] = [];
                for (const value of modules) {
                    if (value.includes(',')) {
                        flattened.push(...value.split(',').map(mod => mod.trim()));
                    } else {
                        flattened.push(value);
                    }
                }
                modules = flattened;
            }
            rebuild(target, { cacheRoot, modules, forceAbi });
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

async function theiaCli(): Promise<void> {
    const { version } = await fs.promises.readFile(path.join(__dirname, '../package.json'), 'utf8').then(JSON.parse);
    yargs.scriptName('theia').version(version);
    const projectPath = process.cwd();
    // Create a sub `yargs` parser to read `app-target` without
    // affecting the global `yargs` instance used by the CLI.
    const { appTarget } = defineCommonOptions(yargsFactory()).help(false).parse();
    const manager = new ApplicationPackageManager({ projectPath, appTarget });
    const localizationManager = new LocalizationManager();
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
            packed: boolean,
            ignoreErrors: boolean,
            apiVersion?: string,
            apiUrl?: string,
            proxyUrl?: string,
            proxyAuthentification?: string,
            strictSsl: boolean
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
                    default: DEFAULT_SUPPORTED_API_VERSION
                },
                'api-url': {
                    alias: 'u',
                    describe: 'Open-VSX Registry API URL',
                    default: 'https://open-vsx.org/api'
                },
                'proxy-url': {
                    describe: 'Proxy URL'
                },
                'proxy-authentification': {
                    describe: 'Proxy authentification information'
                },
                'strict-ssl': {
                    describe: 'Whether to enable strict SSL mode',
                    boolean: true,
                    default: false
                }
            },
            handler: async args => {
                await downloadPlugins(args);
            },
        })
        .command<{
            freeApi?: boolean,
            deeplKey: string,
            file: string,
            languages: string[],
            sourceLanguage?: string
        }>({
            command: 'nls-localize [languages...]',
            describe: 'Localize json files using the DeepL API',
            builder: {
                'file': {
                    alias: 'f',
                    describe: 'The source file which should be translated',
                    demandOption: true
                },
                'deepl-key': {
                    alias: 'k',
                    describe: 'DeepL key used for API access. See https://www.deepl.com/docs-api for more information',
                    demandOption: true
                },
                'free-api': {
                    describe: 'Indicates whether the specified DeepL API key belongs to the free API',
                    boolean: true,
                    default: false,
                },
                'source-language': {
                    alias: 's',
                    describe: 'The source language of the translation file'
                }
            },
            handler: async ({ freeApi, deeplKey, file, sourceLanguage, languages = [] }) => {
                await localizationManager.localize({
                    sourceFile: file,
                    freeApi: freeApi ?? true,
                    authKey: deeplKey,
                    targetLanguages: languages,
                    sourceLanguage
                });
            }
        })
        .command<{
            root: string,
            output: string,
            merge: boolean,
            exclude?: string,
            logs?: string,
            files?: string[],
            quiet: boolean
        }>({
            command: 'nls-extract',
            describe: 'Extract translation key/value pairs from source code',
            builder: {
                'output': {
                    alias: 'o',
                    describe: 'Output file for the extracted translations',
                    demandOption: true
                },
                'root': {
                    alias: 'r',
                    describe: 'The directory which contains the source code',
                    default: '.'
                },
                'merge': {
                    alias: 'm',
                    describe: 'Whether to merge new with existing translation values',
                    boolean: true,
                    default: false
                },
                'exclude': {
                    alias: 'e',
                    describe: 'Allows to exclude translation keys starting with this value'
                },
                'files': {
                    alias: 'f',
                    describe: 'Glob pattern matching the files to extract from (starting from --root).',
                    array: true
                },
                'logs': {
                    alias: 'l',
                    describe: 'File path to a log file'
                },
                'quiet': {
                    alias: 'q',
                    describe: 'Prevents errors from being logged to console',
                    boolean: true,
                    default: false
                }
            },
            handler: async options => {
                await extract(options);
            }
        })
        .command<{
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
        .command<{
            electronVersion?: string
            electronDist?: string
            ffmpegPath?: string
            platform?: NodeJS.Platform
        }>({
            command: 'ffmpeg:replace [ffmpeg-path]',
            describe: '',
            builder: {
                'electronDist': {
                    description: 'Electron distribution location.',
                },
                'electronVersion': {
                    description: 'Electron version for which to pull the "clean" ffmpeg library.',
                },
                'ffmpegPath': {
                    description: 'Absolute path to the ffmpeg shared library.',
                },
                'platform': {
                    description: 'Dictates where the library is located within the Electron distribution.',
                    choices: ['darwin', 'linux', 'win32'] as NodeJS.Platform[],
                },
            },
            handler: async options => {
                await ffmpeg.replaceFfmpeg(options);
            },
        })
        .command<{
            electronDist?: string
            ffmpegPath?: string
            json?: boolean
            platform?: NodeJS.Platform
        }>({
            command: 'ffmpeg:check [ffmpeg-path]',
            describe: '(electron-only) Check that ffmpeg doesn\'t contain proprietary codecs',
            builder: {
                'electronDist': {
                    description: 'Electron distribution location',
                },
                'ffmpegPath': {
                    describe: 'Absolute path to the ffmpeg shared library',
                },
                'json': {
                    description: 'Output the found codecs as JSON on stdout',
                    boolean: true,
                },
                'platform': {
                    description: 'Dictates where the library is located within the Electron distribution',
                    choices: ['darwin', 'linux', 'win32'] as NodeJS.Platform[],
                },
            },
            handler: options => {
                ffmpeg.checkFfmpeg(options);
            },
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
