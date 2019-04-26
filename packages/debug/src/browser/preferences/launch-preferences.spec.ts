/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

// tslint:disable:no-any
// tslint:disable:no-unused-expression

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import * as path from 'path';
import * as fs from 'fs-extra';
import * as assert from 'assert';
import { Container } from 'inversify';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { PreferenceService, PreferenceServiceImpl, PreferenceScope } from '@theia/core/lib/browser/preferences/preference-service';
import { bindPreferenceService, bindMessageService, bindResourceProvider } from '@theia/core/lib/browser/frontend-application-module';
import { bindFileSystem } from '@theia/filesystem/lib/node/filesystem-backend-module';
import { bindFileResource } from '@theia/filesystem/lib/browser/filesystem-frontend-module';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FileSystemWatcher } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { bindFileSystemPreferences } from '@theia/filesystem/lib/browser/filesystem-preferences';
import { FileShouldOverwrite } from '@theia/filesystem/lib/common/filesystem';
import { bindLogger } from '@theia/core/lib/node/logger-backend-module';
import { bindWorkspacePreferences } from '@theia/workspace/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { MockWindowService } from '@theia/core/lib/browser/window/test/mock-window-service';
import { MockWorkspaceServer } from '@theia/workspace/lib/common/test/mock-workspace-server';
import { WorkspaceServer } from '@theia/workspace/lib/common/workspace-protocol';
import { bindPreferenceProviders } from '@theia/preferences/lib/browser/preference-bindings';
import { bindUserStorage } from '@theia/userstorage/lib/browser/user-storage-frontend-module';
import { FileSystemWatcherServer } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { MockFilesystemWatcherServer } from '@theia/filesystem/lib/common/test/mock-filesystem-watcher-server';
import { bindLaunchPreferences } from './launch-preferences';

disableJSDOM();

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason);
    throw reason;
});

/**
 * Expectations should be tested and aligned against VS Code.
 * See https://github.com/akosyakov/vscode-launch/blob/master/src/test/extension.test.ts
 */
describe('Launch Preferences', () => {

    type ConfigMode = '.vscode' | '.theia' | ['.theia', '.vscode'];

    const defaultLaunch = {
        'configurations': [],
        'compounds': []
    };

    const validConfiguration = {
        'name': 'Launch Program',
        'program': '${file}',
        'request': 'launch',
        'type': 'node',
    };

    const validConfiguration2 = {
        'name': 'Launch Program 2',
        'program': '${file}',
        'request': 'launch',
        'type': 'node',
    };

    const bogusConfiguration = {};

    const validCompound = {
        'name': 'Compound',
        'configurations': [
            'Launch Program',
            'Launch Program 2'
        ]
    };

    const bogusCompound = {};

    const bogusCompound2 = {
        'name': 'Compound 2',
        'configurations': [
            'Foo',
            'Launch Program 2'
        ]
    };

    const validLaunch = {
        configurations: [validConfiguration, validConfiguration2],
        compounds: [validCompound]
    };

    testSuite({
        name: 'No Preferences',
        expectation: defaultLaunch
    });

    testLaunchAndSettingsSuite({
        name: 'Empty With Version',
        launch: {
            'version': '0.2.0'
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [],
            'compounds': []
        }
    });

    testLaunchAndSettingsSuite({
        name: 'Empty With Version And Configurations',
        launch: {
            'version': '0.2.0',
            'configurations': [],
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [],
            'compounds': []
        }
    });

    testLaunchAndSettingsSuite({
        name: 'Empty With Version And Compounds',
        launch: {
            'version': '0.2.0',
            'compounds': []
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [],
            'compounds': []
        }
    });

    testLaunchAndSettingsSuite({
        name: 'Valid Conf',
        launch: {
            'version': '0.2.0',
            'configurations': [validConfiguration]
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [validConfiguration],
            'compounds': []
        }
    });

    testLaunchAndSettingsSuite({
        name: 'Bogus Conf',
        launch: {
            'version': '0.2.0',
            'configurations': [validConfiguration, bogusConfiguration]
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [validConfiguration, bogusConfiguration],
            'compounds': []
        }
    });

    testLaunchAndSettingsSuite({
        name: 'Completely Bogus Conf',
        launch: {
            'version': '0.2.0',
            'configurations': { 'valid': validConfiguration, 'bogus': bogusConfiguration }
        },
        expectation: {
            'version': '0.2.0',
            'configurations': { 'valid': validConfiguration, 'bogus': bogusConfiguration },
            'compounds': []
        }
    });

    const arrayBogusLaunch = [
        'version', '0.2.0',
        'configurations', { 'valid': validConfiguration, 'bogus': bogusConfiguration }
    ];
    testSuite({
        name: 'Array Bogus Launch Configuration',
        launch: arrayBogusLaunch,
        expectation: {
            '0': 'version',
            '1': '0.2.0',
            '2': 'configurations',
            '3': { 'valid': validConfiguration, 'bogus': bogusConfiguration },
            'compounds': [],
            'configurations': []
        },
        inspectExpectation: {
            preferenceName: 'launch',
            defaultValue: defaultLaunch,
            workspaceValue: {
                '0': 'version',
                '1': '0.2.0',
                '2': 'configurations',
                '3': { 'valid': validConfiguration, 'bogus': bogusConfiguration }
            }
        }
    });
    testSuite({
        name: 'Array Bogus Settings Configuration',
        settings: {
            launch: arrayBogusLaunch
        },
        expectation: {
            '0': 'version',
            '1': '0.2.0',
            '2': 'configurations',
            '3': { 'valid': validConfiguration, 'bogus': bogusConfiguration },
            'compounds': [],
            'configurations': []
        },
        inspectExpectation: {
            preferenceName: 'launch',
            defaultValue: defaultLaunch,
            workspaceValue: arrayBogusLaunch
        }
    });

    testSuite({
        name: 'Null Bogus Launch Configuration',
        // tslint:disable-next-line:no-null-keyword
        launch: null,
        expectation: {
            'compounds': [],
            'configurations': []
        }
    });
    testSuite({
        name: 'Null Bogus Settings Configuration',
        settings: {
            // tslint:disable-next-line:no-null-keyword
            'launch': null
        },
        expectation: {}
    });

    testLaunchAndSettingsSuite({
        name: 'Valid Compound',
        launch: {
            'version': '0.2.0',
            'configurations': [validConfiguration, validConfiguration2],
            'compounds': [validCompound]
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [validConfiguration, validConfiguration2],
            'compounds': [validCompound]
        }
    });

    testLaunchAndSettingsSuite({
        name: 'Valid And Bogus',
        launch: {
            'version': '0.2.0',
            'configurations': [validConfiguration, validConfiguration2, bogusConfiguration],
            'compounds': [validCompound, bogusCompound, bogusCompound2]
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [validConfiguration, validConfiguration2, bogusConfiguration],
            'compounds': [validCompound, bogusCompound, bogusCompound2]
        }
    });

    testSuite({
        name: 'Mixed',
        launch: {
            'version': '0.2.0',
            'configurations': [validConfiguration, bogusConfiguration],
            'compounds': [bogusCompound, bogusCompound2]
        },
        settings: {
            launch: {
                'version': '0.2.0',
                'configurations': [validConfiguration2],
                'compounds': [validCompound]
            }
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [validConfiguration, bogusConfiguration],
            'compounds': [bogusCompound, bogusCompound2]
        }
    });

    testSuite({
        name: 'Mixed Launch Without Configurations',
        launch: {
            'version': '0.2.0',
            'compounds': [bogusCompound, bogusCompound2]
        },
        settings: {
            launch: {
                'version': '0.2.0',
                'configurations': [validConfiguration2],
                'compounds': [validCompound]
            }
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [validConfiguration2],
            'compounds': [bogusCompound, bogusCompound2]
        },
        inspectExpectation: {
            preferenceName: 'launch',
            defaultValue: defaultLaunch,
            workspaceValue: {
                'version': '0.2.0',
                'configurations': [validConfiguration2],
                'compounds': [bogusCompound, bogusCompound2]
            }
        }
    });

    function testLaunchAndSettingsSuite({
        name, expectation, launch, only, configMode
    }: {
            name: string,
            expectation: any,
            launch?: any,
            only?: boolean,
            configMode?: ConfigMode
        }): void {
        testSuite({
            name: name + ' Launch Configuration',
            launch,
            expectation,
            only,
            configMode
        });
        testSuite({
            name: name + ' Settings Configuration',
            settings: {
                'launch': launch
            },
            expectation,
            only,
            configMode
        });
    }

    function testSuite(options: {
        name: string,
        expectation: any,
        inspectExpectation?: any,
        launch?: any,
        settings?: any,
        only?: boolean,
        configMode?: ConfigMode
    }): void {

        describe(options.name, () => {

            if (options.configMode) {
                testConfigSuite(options as any);
            } else {

                testConfigSuite({
                    ...options,
                    configMode: '.theia'
                });

                if (options.settings || options.launch) {
                    testConfigSuite({
                        ...options,
                        configMode: '.vscode'
                    });

                    testConfigSuite({
                        ...options,
                        configMode: ['.theia', '.vscode']
                    });
                }
            }

        });

    }

    function testConfigSuite({
        configMode, expectation, inspectExpectation, settings, launch, only
    }: {
            configMode: ConfigMode
            expectation: any,
            inspectExpectation?: any,
            launch?: any,
            settings?: any,
            only?: boolean
        }): void {

        describe(JSON.stringify(configMode, undefined, 2), () => {

            const configPaths = Array.isArray(configMode) ? configMode : [configMode];

            const rootPath = path.resolve(__dirname, '..', '..', '..', 'launch-preference-test-temp');
            const rootUri = FileUri.create(rootPath).toString();

            let preferences: PreferenceService;

            const toTearDown = new DisposableCollection();
            beforeEach(async function () {
                toTearDown.push(Disposable.create(enableJSDOM()));
                FrontendApplicationConfigProvider.set({
                    'applicationName': 'test',
                });

                fs.removeSync(rootPath);
                fs.ensureDirSync(rootPath);
                toTearDown.push(Disposable.create(() => fs.removeSync(rootPath)));

                if (settings) {
                    for (const configPath of configPaths) {
                        const settingsPath = path.resolve(rootPath, configPath, 'settings.json');
                        fs.ensureFileSync(settingsPath);
                        fs.writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8');
                    }
                }
                if (launch) {
                    for (const configPath of configPaths) {
                        const launchPath = path.resolve(rootPath, configPath, 'launch.json');
                        fs.ensureFileSync(launchPath);
                        fs.writeFileSync(launchPath, JSON.stringify(launch), 'utf-8');
                    }
                }

                const container = new Container();
                const bind = container.bind.bind(container);
                const unbind = container.unbind.bind(container);
                bindLogger(bind);
                bindMessageService(bind);
                bindResourceProvider(bind);
                bindFileResource(bind);
                bindUserStorage(bind);
                bindPreferenceService(bind);
                bindFileSystem(bind);
                bind(FileSystemWatcherServer).toConstantValue(new MockFilesystemWatcherServer());
                bindFileSystemPreferences(bind);
                container.bind(FileShouldOverwrite).toConstantValue(async () => true);
                bind(FileSystemWatcher).toSelf().inSingletonScope();
                bindPreferenceProviders(bind, unbind);
                bindWorkspacePreferences(bind);
                container.bind(WorkspaceService).toSelf().inSingletonScope();
                container.bind(WindowService).toConstantValue(new MockWindowService());

                const workspaceServer = new MockWorkspaceServer();
                workspaceServer['getMostRecentlyUsedWorkspace'] = async () => rootUri;
                container.bind(WorkspaceServer).toConstantValue(workspaceServer);

                bindLaunchPreferences(bind);

                toTearDown.push(container.get(FileSystemWatcher));

                const impl = container.get(PreferenceServiceImpl);
                impl.initialize();
                toTearDown.push(impl);

                preferences = impl;
                toTearDown.push(Disposable.create(() => preferences = undefined!));

                await preferences.ready;
                await container.get(WorkspaceService).roots;
            });

            afterEach(() => toTearDown.dispose());

            const testIt = !!only ? it.only : it;

            const settingsLaunch = settings ? settings['launch'] : undefined;

            testIt('get from default', () => {
                const config = preferences.get('launch');
                assert.deepStrictEqual(JSON.parse(JSON.stringify(config)), expectation);
            });

            testIt('get from undefind', () => {
                const config = preferences.get('launch', undefined, undefined);
                assert.deepStrictEqual(JSON.parse(JSON.stringify(config)), expectation);
            });

            testIt('get from rootUri', () => {
                const config = preferences.get('launch', undefined, rootUri);
                assert.deepStrictEqual(JSON.parse(JSON.stringify(config)), expectation);
            });

            testIt('inspect in undefined', () => {
                const inspect = preferences.inspect('launch');
                let expected = inspectExpectation;
                if (!expected) {
                    expected = {
                        preferenceName: 'launch',
                        defaultValue: defaultLaunch
                    };
                    const workspaceValue = launch || settingsLaunch;
                    if (workspaceValue !== undefined) {
                        Object.assign(expected, { workspaceValue });
                    }
                }
                assert.deepStrictEqual(JSON.parse(JSON.stringify(inspect)), expected);
            });

            testIt('inspect in rootUri', () => {
                const inspect = preferences.inspect('launch', rootUri);
                const expected = {
                    preferenceName: 'launch',
                    defaultValue: defaultLaunch
                };
                if (inspectExpectation) {
                    Object.assign(expected, {
                        workspaceValue: inspectExpectation.workspaceValue,
                        workspaceFolderValue: inspectExpectation.workspaceValue
                    });
                } else {
                    const value = launch || settingsLaunch;
                    if (value !== undefined) {
                        Object.assign(expected, {
                            workspaceValue: value,
                            workspaceFolderValue: value
                        });
                    }
                }
                assert.deepStrictEqual(JSON.parse(JSON.stringify(inspect)), expected);
            });

            testIt('update launch', async () => {
                await preferences.set('launch', validLaunch);

                const inspect = preferences.inspect('launch');
                const actual = inspect && inspect.workspaceValue;
                const expected = settingsLaunch && !Array.isArray(settingsLaunch) ? { ...settingsLaunch, ...validLaunch } : validLaunch;
                assert.deepStrictEqual(actual, expected);
            });

            testIt('update launch Global', async () => {
                try {
                    await preferences.set('launch', validLaunch, PreferenceScope.User);
                    assert.fail('should not be possible to update User Settings');
                } catch (e) {
                    assert.deepStrictEqual(e.message, 'Unable to write to User Settings because launch does not support for global scope.');
                }
            });

            testIt('update launch Workspace', async () => {
                await preferences.set('launch', validLaunch, PreferenceScope.Workspace);

                const inspect = preferences.inspect('launch');
                const actual = inspect && inspect.workspaceValue;
                const expected = settingsLaunch && !Array.isArray(settingsLaunch) ? { ...settingsLaunch, ...validLaunch } : validLaunch;
                assert.deepStrictEqual(actual, expected);
            });

            testIt('update launch WorkspaceFolder', async () => {
                try {
                    await preferences.set('launch', validLaunch, PreferenceScope.Folder);
                    assert.fail('should not be possible to update Workspace Folder Without resource');
                } catch (e) {
                    assert.deepStrictEqual(e.message, 'Unable to write to Folder Settings because no resource is provided.');
                }
            });

            testIt('update launch WorkspaceFolder with resource', async () => {
                await preferences.set('launch', validLaunch, PreferenceScope.Folder, rootUri);

                const inspect = preferences.inspect('launch');
                const actual = inspect && inspect.workspaceValue;
                const expected = settingsLaunch && !Array.isArray(settingsLaunch) ? { ...settingsLaunch, ...validLaunch } : validLaunch;
                assert.deepStrictEqual(actual, expected);
            });

            if ((launch && !Array.isArray(launch)) || (settingsLaunch && !Array.isArray(settingsLaunch))) {
                testIt('update launch.configurations', async () => {
                    await preferences.set('launch.configurations', [validConfiguration, validConfiguration2]);

                    const inspect = preferences.inspect('launch');
                    const actual = inspect && inspect.workspaceValue && (<any>inspect.workspaceValue).configurations;
                    assert.deepStrictEqual(actual, [validConfiguration, validConfiguration2]);
                });
            }

            testIt('delete launch', async () => {
                await preferences.set('launch', undefined);
                const actual = preferences.inspect('launch');

                let expected = undefined;
                if (configPaths[1]) {
                    expected = launch;
                    if (Array.isArray(expected)) {
                        expected = { ...expected };
                    }
                    if (expected && !expected.configurations && settingsLaunch && settingsLaunch.configurations !== undefined) {
                        expected.configurations = settingsLaunch.configurations;
                    }
                }
                expected = expected || settingsLaunch;
                assert.deepStrictEqual(actual && actual.workspaceValue, expected);
            });

            if ((launch && !Array.isArray(launch)) || (settingsLaunch && !Array.isArray(settingsLaunch))) {
                testIt('delete launch.configurations', async () => {
                    await preferences.set('launch.configurations', undefined);

                    const actual = preferences.inspect('launch');
                    const actualWorkspaceValue = actual && actual.workspaceValue;

                    let expected = undefined;
                    if (launch) {
                        expected = { ...launch };
                        delete expected['configurations'];
                    }
                    if (settings) {
                        let _settingsLaunch = undefined;
                        if (typeof settingsLaunch === 'object' && !Array.isArray(settings['launch']) && settings['launch'] !== null) {
                            _settingsLaunch = settingsLaunch;
                        } else {
                            _settingsLaunch = expectation;
                        }
                        if (expected) {
                            if (_settingsLaunch.configurations !== undefined) {
                                expected.configurations = _settingsLaunch.configurations;
                            }
                        } else {
                            expected = _settingsLaunch;
                        }
                    }

                    assert.deepStrictEqual(actualWorkspaceValue, expected);
                });
            }

        });

    }

});
