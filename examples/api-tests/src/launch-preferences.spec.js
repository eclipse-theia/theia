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

// @ts-check
/* eslint-disable no-unused-expressions, @typescript-eslint/no-explicit-any */

/**
 * @typedef {'.vscode' | '.theia' | ['.theia', '.vscode']} ConfigMode
 */

/**
 * Expectations should be tested and aligned against VS Code.
 * See https://github.com/akosyakov/vscode-launch/blob/master/src/test/extension.test.ts
 */
describe('Launch Preferences', function () {
    this.timeout(5000);

    const { assert } = chai;

    const { PreferenceService, PreferenceScope } = require('@theia/core/lib/browser/preferences/preference-service');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');
    const { FileService } = require('@theia/filesystem/lib/browser/file-service');
    const { FileResourceResolver } = require('@theia/filesystem/lib/browser/file-resource');
    const { MonacoTextModelService } = require('@theia/monaco/lib/browser/monaco-text-model-service');
    const { MonacoWorkspace } = require('@theia/monaco/lib/browser/monaco-workspace');

    const container = window.theia.container;
    /** @type {import('@theia/core/lib/browser/preferences/preference-service').PreferenceService} */
    const preferences = container.get(PreferenceService);
    const workspaceService = container.get(WorkspaceService);
    const fileService = container.get(FileService);
    const textModelService = container.get(MonacoTextModelService);
    const workspace = container.get(MonacoWorkspace);
    const fileResourceResolver = container.get(FileResourceResolver);

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
        // eslint-disable-next-line no-null/no-null
        launch: null,
        expectation: {
            'compounds': [],
            'configurations': []
        }
    });
    testSuite({
        name: 'Null Bogus Settings Configuration',
        settings: {
            // eslint-disable-next-line no-null/no-null
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

    /**
     * @typedef {Object} LaunchAndSettingsSuiteOptions
     * @property {string} name
     * @property {any} expectation
     * @property {any} [launch]
     * @property {boolean} [only]
     * @property {ConfigMode} [configMode]
     */
    /**
     * @type {(options: LaunchAndSettingsSuiteOptions) => void}
     */
    function testLaunchAndSettingsSuite({
        name, expectation, launch, only, configMode
    }) {
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

    /**
     * @typedef {Object} SuiteOptions
     * @property {string} name
     * @property {any} expectation
     * @property {any} [inspectExpectation]
     * @property {any} [launch]
     * @property {any} [settings]
     * @property {boolean} [only]
     * @property {ConfigMode} [configMode]
     */
    /**
     * @type {(options: SuiteOptions) => void}
     */
    function testSuite(options) {
        describe(options.name, () => {

            if (options.configMode) {
                testConfigSuite(options);
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

    const rootUri = workspaceService.tryGetRoots()[0].resource;

    function deleteWorkspacePreferences() {
        const promises = [];
        for (const configPath of ['.theia', '.vscode']) {
            for (const name of ['settings', 'launch']) {
                promises.push((async () => {
                    try {
                        const reference = await textModelService.createModelReference(rootUri.resolve(configPath + '/' + name + '.json'));
                        try {
                            if (!reference.object.valid) {
                                return;
                            }
                            await new Promise(resolve => {
                                const listener = reference.object.onDidChangeValid(() => {
                                    listener.dispose();
                                    resolve();
                                });
                            });
                        } finally {
                            reference.dispose();
                        }
                    } catch (e) {
                        console.error(e);
                    }
                })());
            }
        }
        return Promise.all([
            ...promises,
            fileService.delete(rootUri.resolve('.theia'), { fromUserGesture: false, recursive: true }).catch(() => { }),
            fileService.delete(rootUri.resolve('.vscode'), { fromUserGesture: false, recursive: true }).catch(() => { })
        ]);
    }

    const originalShouldOverwrite = fileResourceResolver['shouldOverwrite'];

    before(async () => {
        // fail tests if out of async happens
        fileResourceResolver['shouldOverwrite'] = async () => (assert.fail('should be in sync'), false);
        await deleteWorkspacePreferences();
    });

    after(() => {
        fileResourceResolver['shouldOverwrite'] = originalShouldOverwrite;
    });

    /**
     * @typedef {Object} ConfigSuiteOptions
     * @property {any} expectation
     * @property {any} [inspectExpectation]
     * @property {any} [launch]
     * @property {any} [settings]
     * @property {boolean} [only]
     * @property {ConfigMode} [configMode]
     */
    /**
     * @type {(options: ConfigSuiteOptions) => void}
     */
    function testConfigSuite({
        configMode, expectation, inspectExpectation, settings, launch, only
    }) {

        describe(JSON.stringify(configMode, undefined, 2), () => {
            const configPaths = Array.isArray(configMode) ? configMode : [configMode];

            /** @typedef {monaco.editor.IReference<import('@theia/monaco/lib/browser/monaco-editor-model').MonacoEditorModel>} ConfigModelReference */
            /** @type {ConfigModelReference[]} */
            beforeEach(async () => {
                /** @type {Promise<void>[]} */
                const promises = [];
                /**
                 * @param {string} name
                 * @param {string} text
                 */
                const ensureConfigModel = (name, text) => {
                    for (const configPath of configPaths) {
                        promises.push((async () => {
                            try {
                                const reference = await textModelService.createModelReference(rootUri.resolve(configPath + '/' + name + '.json'));
                                try {
                                    await workspace.applyBackgroundEdit(reference.object, [{
                                        text,
                                        range: reference.object.textEditorModel.getFullModelRange(),
                                        forceMoveMarkers: false
                                    }]);
                                } finally {
                                    reference.dispose();
                                }
                            } catch (e) {
                                console.error(e);
                            }
                        })());
                    }
                };
                if (settings) {
                    ensureConfigModel('settings', JSON.stringify(settings));
                }
                if (launch) {
                    ensureConfigModel('launch', JSON.stringify(launch));
                }
                await Promise.all(promises);
            });

            after(() => deleteWorkspacePreferences());

            const testItOnly = !!only ? it.only : it;
            const testIt = testItOnly;

            const settingsLaunch = settings ? settings['launch'] : undefined;

            testIt('get from default', () => {
                const config = preferences.get('launch');
                assert.deepStrictEqual(JSON.parse(JSON.stringify(config)), expectation);
            });

            testIt('get from undefined', () => {
                /** @type {any} */
                const config = preferences.get('launch', undefined, undefined);
                assert.deepStrictEqual(JSON.parse(JSON.stringify(config)), expectation);
            });

            testIt('get from rootUri', () => {
                /** @type {any} */
                const config = preferences.get('launch', undefined, rootUri.toString());
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
                const inspect = preferences.inspect('launch', rootUri.toString());
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
                await preferences.set('launch', validLaunch, PreferenceScope.Folder, rootUri.toString());

                const inspect = preferences.inspect('launch');
                const actual = inspect && inspect.workspaceValue;
                const expected = settingsLaunch && !Array.isArray(settingsLaunch) ? { ...settingsLaunch, ...validLaunch } : validLaunch;
                assert.deepStrictEqual(actual, expected);
            });

            if ((launch && !Array.isArray(launch)) || (settingsLaunch && !Array.isArray(settingsLaunch))) {
                testIt('update launch.configurations', async () => {
                    await preferences.set('launch.configurations', [validConfiguration, validConfiguration2]);

                    const inspect = preferences.inspect('launch');
                    const actual = inspect && inspect.workspaceValue && inspect.workspaceValue.configurations;
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
                        // eslint-disable-next-line no-null/no-null
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
