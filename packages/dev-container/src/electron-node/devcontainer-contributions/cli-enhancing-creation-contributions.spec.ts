// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { SettingsContribution } from './cli-enhancing-creation-contributions';
import { RemoteCliContext } from '@theia/core/lib/node/remote/remote-cli-contribution';
import { OS } from '@theia/core/lib/common/os';
import * as Docker from 'dockerode';

describe('SettingsContribution', () => {
    let settingsContribution: SettingsContribution;

    beforeEach(() => {
        settingsContribution = new SettingsContribution();
    });

    describe('base64 encoding for complex values', () => {

        it('should encode nested objects as base64', async () => {
            const nestedSettings = {
                'editor.codeActionsOnSave': {
                    'source.fixAll': true,
                    'source.organizeImports': true
                }
            };

            const containerConfig = {
                image: 'test',
                settings: nestedSettings
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.match(/^--set-preference=editor\.codeActionsOnSave=base64:/);

            const base64Part = args[0].split('base64:')[1];
            const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString('utf-8'));
            expect(decoded).to.deep.equal(nestedSettings['editor.codeActionsOnSave']);
        });

        it('should encode deeply nested objects as base64', async () => {
            const deeplyNestedSettings = {
                'complex.setting': {
                    level1: {
                        level2: {
                            level3: {
                                value: 'deep'
                            }
                        }
                    }
                }
            };

            const containerConfig = {
                image: 'test',
                settings: deeplyNestedSettings
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.match(/^--set-preference=complex\.setting=base64:/);

            const base64Part = args[0].split('base64:')[1];
            const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString('utf-8'));
            expect(decoded).to.deep.equal(deeplyNestedSettings['complex.setting']);
        });

        it('should encode arrays as base64', async () => {
            const arraySettings = {
                'files.exclude': ['**/.git', '**/.svn', '**/node_modules']
            };

            const containerConfig = {
                image: 'test',
                settings: arraySettings
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.match(/^--set-preference=files\.exclude=base64:/);

            const base64Part = args[0].split('base64:')[1];
            const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString('utf-8'));
            expect(decoded).to.deep.equal(arraySettings['files.exclude']);
        });

        it('should encode arrays of objects as base64', async () => {
            const complexArraySettings = {
                'launch.configurations': [
                    { type: 'node', request: 'launch', name: 'Launch Program' },
                    { type: 'chrome', request: 'attach', name: 'Attach to Chrome' }
                ]
            };

            const containerConfig = {
                image: 'test',
                settings: complexArraySettings
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.match(/^--set-preference=launch\.configurations=base64:/);

            const base64Part = args[0].split('base64:')[1];
            const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString('utf-8'));
            expect(decoded).to.deep.equal(complexArraySettings['launch.configurations']);
        });

        it('should encode empty objects as base64', async () => {
            const emptyObjectSettings = {
                'empty.object': {}
            };

            const containerConfig = {
                image: 'test',
                settings: emptyObjectSettings
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.match(/^--set-preference=empty\.object=base64:/);

            const base64Part = args[0].split('base64:')[1];
            const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString('utf-8'));
            expect(decoded).to.deep.equal({});
        });

        it('should encode empty arrays as base64', async () => {
            const emptyArraySettings = {
                'empty.array': []
            };

            const containerConfig = {
                image: 'test',
                settings: emptyArraySettings
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.match(/^--set-preference=empty\.array=base64:/);

            const base64Part = args[0].split('base64:')[1];
            const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString('utf-8'));
            expect(decoded).to.deep.equal([]);
        });

        it('should handle values containing equals signs in objects', async () => {
            const settingsWithEquals = {
                'test.config': {
                    formula: 'a=b+c',
                    equation: 'x=y=z'
                }
            };

            const containerConfig = {
                image: 'test',
                settings: settingsWithEquals
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.match(/^--set-preference=test\.config=base64:/);

            const base64Part = args[0].split('base64:')[1];
            const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString('utf-8'));
            expect(decoded).to.deep.equal(settingsWithEquals['test.config']);
            expect(decoded.formula).to.equal('a=b+c');
            expect(decoded.equation).to.equal('x=y=z');
        });
    });

    describe('round-trip encode/decode validation', () => {

        const simulateDecode = (encodedArg: string): unknown => {
            const prefixRemoved = encodedArg.substring('--set-preference='.length);
            const firstEqualIndex = prefixRemoved.indexOf('=');
            let rawValue = prefixRemoved.substring(firstEqualIndex + 1);
            if (rawValue.startsWith('base64:')) {
                rawValue = Buffer.from(rawValue.substring('base64:'.length), 'base64').toString('utf-8');
            }
            return JSON.parse(rawValue);
        };

        it('should successfully round-trip nested objects', async () => {
            const originalValue = {
                nested: {
                    deep: {
                        value: 'test',
                        number: 42
                    }
                }
            };

            const containerConfig = {
                image: 'test',
                settings: { 'test.setting': originalValue }
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            const decodedValue = simulateDecode(args[0]);
            expect(decodedValue).to.deep.equal(originalValue);
        });

        it('should successfully round-trip arrays', async () => {
            const originalValue = ['item1', 'item2', 'item3'];

            const containerConfig = {
                image: 'test',
                settings: { 'test.array': originalValue }
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            const decodedValue = simulateDecode(args[0]);
            expect(decodedValue).to.deep.equal(originalValue);
        });

        it('should successfully round-trip values with equals signs', async () => {
            const originalValue = {
                equation: 'a=b=c',
                formula: 'x=y'
            };

            const containerConfig = {
                image: 'test',
                settings: { 'test.equals': originalValue }
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            const decodedValue = simulateDecode(args[0]);
            expect(decodedValue).to.deep.equal(originalValue);
        });

        it('should successfully round-trip empty objects', async () => {
            const originalValue = {};

            const containerConfig = {
                image: 'test',
                settings: { 'test.empty': originalValue }
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            const decodedValue = simulateDecode(args[0]);
            expect(decodedValue).to.deep.equal(originalValue);
        });

        it('should successfully round-trip mixed complex structures', async () => {
            const originalValue = {
                string: 'test',
                number: 123,
                boolean: true,
                array: [1, 'two', { three: 3 }],
                nested: {
                    deep: {
                        value: 'with=equals'
                    }
                }
            };

            const containerConfig = {
                image: 'test',
                settings: { 'test.complex': originalValue }
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            const decodedValue = simulateDecode(args[0]);
            expect(decodedValue).to.deep.equal(originalValue);
        });
    });

    describe('primitive values (not base64 encoded)', () => {

        it('should not encode string values as base64', async () => {
            const stringSettings = {
                'editor.fontSize': '14'
            };

            const containerConfig = {
                image: 'test',
                settings: stringSettings
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.equal('--set-preference=editor.fontSize="14"');
            expect(args[0]).to.not.include('base64:');
        });

        it('should not encode number values as base64', async () => {
            const numberSettings = {
                'editor.tabSize': 4
            };

            const containerConfig = {
                image: 'test',
                settings: numberSettings
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.equal('--set-preference=editor.tabSize=4');
            expect(args[0]).to.not.include('base64:');
        });

        it('should not encode boolean values as base64', async () => {
            const booleanSettings = {
                'editor.wordWrap': true
            };

            const containerConfig = {
                image: 'test',
                settings: booleanSettings
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.equal('--set-preference=editor.wordWrap=true');
            expect(args[0]).to.not.include('base64:');
        });

        it('should handle strings containing equals signs without base64', async () => {
            const stringWithEquals = {
                'test.value': 'a=b'
            };

            const containerConfig = {
                image: 'test',
                settings: stringWithEquals
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.equal('--set-preference=test.value="a=b"');
            expect(args[0]).to.not.include('base64:');
        });
    });

    describe('vscode customizations', () => {

        it('should merge settings from customizations.vscode.settings', async () => {
            const containerConfig = {
                image: 'test',
                settings: {
                    'editor.fontSize': '14'
                },
                customizations: {
                    vscode: {
                        settings: {
                            'editor.tabSize': 4,
                            'files.exclude': ['**/.git']
                        }
                    }
                }
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(3);
            expect(args.some(arg => arg.includes('editor.fontSize'))).to.be.true;
            expect(args.some(arg => arg.includes('editor.tabSize'))).to.be.true;
            expect(args.some(arg => arg.includes('files.exclude'))).to.be.true;
        });

        it('should override settings with customizations.vscode.settings', async () => {
            const containerConfig = {
                image: 'test',
                settings: {
                    'editor.fontSize': '14'
                },
                customizations: {
                    vscode: {
                        settings: {
                            'editor.fontSize': '16'
                        }
                    }
                }
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.equal('--set-preference=editor.fontSize="16"');
        });
    });

    describe('edge cases', () => {

        it('should return empty array when no config is set', () => {
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);
            expect(args).to.be.empty;
        });

        it('should handle config with no settings', async () => {
            const containerConfig = {
                image: 'test'
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.be.empty;
        });

        it('should clear config after enhanceArgs is called', async () => {
            const containerConfig = {
                image: 'test',
                settings: { 'test.setting': 'value' }
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const firstCall = settingsContribution.enhanceArgs(context);
            const secondCall = settingsContribution.enhanceArgs(context);

            expect(firstCall).to.have.lengthOf(1);
            expect(secondCall).to.be.empty;
        });

        it('should handle undefined values', async () => {
            const containerConfig = {
                image: 'test',
                settings: {
                    'test.undefined': undefined
                }
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.equal('--set-preference=test.undefined=undefined');
        });

        it('should handle special characters in setting keys', async () => {
            const containerConfig = {
                image: 'test',
                settings: {
                    'setting.with-dash': 'value',
                    'setting.with_underscore': 'value'
                }
            };

            await settingsContribution.handleContainerCreation({} as Docker.ContainerCreateOptions, containerConfig);
            const context: RemoteCliContext = { platform: { os: OS.Type.Linux, arch: 'x64' }, directory: '/workspace' };
            const args = settingsContribution.enhanceArgs(context);

            expect(args).to.have.lengthOf(2);
            expect(args.some(arg => arg.includes('setting.with-dash'))).to.be.true;
            expect(args.some(arg => arg.includes('setting.with_underscore'))).to.be.true;
        });
    });
});
