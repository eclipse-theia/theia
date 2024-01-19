// *****************************************************************************
// Copyright (C) 2020 Red Hat, Inc. and others.
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

import { Container } from '@theia/core/shared/inversify';
import { PreferenceRegistryExtImpl, PreferenceScope } from './preference-registry';
import * as chai from 'chai';
import { WorkspaceExtImpl } from '../plugin/workspace';
import { ProxyIdentifier, RPCProtocol } from '../common/rpc-protocol';
import { URI } from './types-impl';

const expect = chai.expect;

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('PreferenceRegistryExtImpl:', () => {
    const workspaceRoot = URI.parse('/workspace-root');
    let preferenceRegistryExtImpl: PreferenceRegistryExtImpl;
    const getProxy = (proxyId: ProxyIdentifier<unknown>) => { };
    const set = (identifier: ProxyIdentifier<unknown>, instance: unknown) => { };
    const dispose = () => { };

    const mockRPC = {
        getProxy,
        set,
        dispose
    } as RPCProtocol;
    const mockWorkspace: WorkspaceExtImpl = { workspaceFolders: [{ uri: workspaceRoot, name: 'workspace-root', index: 0 }] } as WorkspaceExtImpl;

    beforeEach(() => {
        const container = new Container();
        container.bind(RPCProtocol).toConstantValue(mockRPC);
        container.bind(WorkspaceExtImpl).toConstantValue(mockWorkspace);
        container.bind(PreferenceRegistryExtImpl).toSelf().inSingletonScope();
        preferenceRegistryExtImpl = container.get(PreferenceRegistryExtImpl);
    });

    describe('Prototype pollution', () => {
        it('Ignores key `__proto__`', () => {
            const value: Record<string, any> = {
                'my.key1.foo': 'value1',
                '__proto__.injectedParsedPrototype': true,
                'a.__proto__.injectedParsedPrototype': true,
                '__proto__': {},
                '[typescript].someKey.foo': 'value',
                '[typescript].__proto__.injectedParsedPrototype': true,
                'b': { '__proto__.injectedParsedPrototype': true },
                'c': { '__proto__': { 'injectedParsedPrototype': true } }
            };
            const configuration = preferenceRegistryExtImpl['getConfigurationModel']('test', value);
            const result = configuration['_contents'];
            expect(result.my, 'Safe keys are preserved.').to.be.an('object');
            expect(result.__proto__, 'Keys containing __proto__ are ignored').to.be.an('undefined');
            expect(result.my.key1.foo, 'Safe keys are dendrified.').to.equal('value1');
            const prototypeObject = Object.prototype as any;
            expect(prototypeObject.injectedParsedPrototype, 'Object.prototype is unaffected').to.be.an('undefined');
            const rawObject = {} as any;
            expect(rawObject.injectedParsedPrototype, 'Instantiated objects are unaffected.').to.be.an('undefined');
        });

        it('Ignores key `constructor.prototype`', () => {
            const value: Record<string, any> = {
                'my.key1.foo': 'value1',
                'a.constructor.prototype.injectedParsedConstructorPrototype': true,
                'constructor.prototype.injectedParsedConstructorPrototype': true,
                '[python].some.key.foo': 'value',
                '[python].a.constructor.prototype.injectedParsedConstructorPrototype': true,
                'constructor': { 'prototype.injectedParsedConstructorPrototype': true },
                'b': { 'constructor': { 'prototype': { 'injectedParsedConstructorPrototype': true } } }
            };
            const configuration = preferenceRegistryExtImpl['getConfigurationModel']('test', value);
            const result = configuration['_contents'];
            expect(result.my, 'Safe keys are preserved').to.be.an('object');
            expect(result.__proto__, 'Keys containing __proto__ are ignored').to.be.an('undefined');
            expect(result.my.key1.foo, 'Safe keys are dendrified.').to.equal('value1');
            const prototypeObject = Object.prototype as any;
            expect(prototypeObject.injectedParsedConstructorPrototype, 'Object.prototype is unaffected').to.be.an('undefined');
            const rawObject = {} as any;
            expect(rawObject.injectedParsedConstructorPrototype, 'Instantiated objects are unaffected.').to.be.an('undefined');
        });
    });

    describe('toConfigurationChangeEvent', () => {
        // E.g. deletion of a `tasks.json`.
        it('Handles deletion of a section', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent']([{ newValue: undefined, preferenceName: 'whole-section' }]);
            expect(affectsChecker.affectsConfiguration('whole-section')).to.be.true;
        });

        it('Reports true of supersection if subsection changes', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent']([{ newValue: 'foo', preferenceName: 'whole-section.subsection.item' }]);
            expect(affectsChecker.affectsConfiguration('whole-section')).to.be.true;
        });

        // This assumes that there should not exist a preference `section` and `section.*` as separate preferences.
        // This is true in practice in all cases except `extensions` (i.e. extensions.json) and extensions.ignoreRecommendations etc.
        // Given that, if a super-section changes (e.g. through deletion), all subsections will also be affected.
        it('Reports true of a subsection if a supersection changes', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent']([{ newValue: 'bar', preferenceName: 'whole-section' }]);
            expect(affectsChecker.affectsConfiguration('whole-section.subsection')).to.be.true;
        });

        it('Does not report true if a different subsection changes:', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent']([{ newValue: 'bar', preferenceName: 'whole-section.subsection.itemA' }]);
            expect(affectsChecker.affectsConfiguration('whole-section.subsection.itemB')).to.be.false;
        });

        it('Reports that any URI is affected if change has no URI', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent']([{ newValue: 'bar', preferenceName: 'whole-section' }]);
            expect(affectsChecker.affectsConfiguration('whole-section.subsection', URI.parse('/wherever'))).to.be.true;
        });

        it('Reports true if no URI is provided to check', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent'](
                [{ newValue: 'bar', preferenceName: 'whole-section', scope: 'file:///very/specific/path' }]
            );
            expect(affectsChecker.affectsConfiguration('whole-section.subsection')).to.be.true;
        });

        it('Reports false if the URIs dont match.', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent'](
                [{ newValue: 'bar', preferenceName: 'whole-section', scope: 'file:///very/specific/path' }]
            );
            expect(affectsChecker.affectsConfiguration('whole-section.subsection', URI.parse('/other/specific/path'))).to.be.false;
        });

        it('Reports true if the URIs do match', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent'](
                [{ newValue: 'bar', preferenceName: 'whole-section', scope: 'file:///very/specific/path' }]
            );
            expect(affectsChecker.affectsConfiguration('whole-section.subsection', URI.parse('/very/specific/path'))).to.be.true;
        });

        it('Reports true if the checked URI is a child of the affected path', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent'](
                [{ newValue: 'bar', preferenceName: 'whole-section', scope: 'file:///very/specific/path' }]
            );
            expect(affectsChecker.affectsConfiguration('whole-section.subsection', URI.parse('/very/specific/path/and/its/child'))).to.be.true;
        });

        it('Reports false if the checked URI starts with the affected path but not at a directory break', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent'](
                [{ newValue: 'bar', preferenceName: 'whole-section', scope: 'file:///very/specific/path' }]
            );
            expect(affectsChecker.affectsConfiguration('whole-section.subsection', URI.parse('/very/specific/path-or-not/and/its/child'))).to.be.false;
        });

        it('Extracts language override and returns false if change does not include language', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent'](
                [{ newValue: 'bar', preferenceName: 'whole-section', scope: 'file:///very/specific/path' }]
            );
            expect(affectsChecker.affectsConfiguration('whole-section.subsection', { languageId: 'typescript' })).to.be.false;
        });

        it('Extracts language override and returns true if change does include language', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent'](
                [{ newValue: 'bar', preferenceName: '[typescript].whole-section', scope: 'file:///very/specific/path' }]
            );
            expect(affectsChecker.affectsConfiguration('whole-section.subsection', { languageId: 'typescript' })).to.be.true;
        });

        it("Extracts language override and URI and returns false if the URI doesn't match", () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent'](
                [{ newValue: 'bar', preferenceName: '[typescript].whole-section', scope: 'file:///very/specific/path' }]
            );
            expect(affectsChecker.affectsConfiguration('whole-section.subsection', { languageId: 'typescript', uri: URI.parse('/other/specific/path') })).to.be.false;
        });

        it('Extracts language override and URI and returns true if both match', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent'](
                [{ newValue: 'bar', preferenceName: '[typescript].whole-section', scope: 'file:///very/specific/path' }]
            );
            expect(affectsChecker.affectsConfiguration('whole-section.subsection', { languageId: 'typescript', uri: URI.parse('/very/specific/path') })).to.be.true;
        });

        it('Reports true if no language override is provided and a language overridden preference changes', () => {
            const affectsChecker = preferenceRegistryExtImpl['toConfigurationChangeEvent'](
                [{ newValue: 'bar', preferenceName: '[typescript].whole-section.subitem', scope: 'file:///somewhat-specific-path' }]
            );
            expect(affectsChecker.affectsConfiguration('whole-section.subitem')).to.be.true;
        });
    });

    describe('Overrides', () => {
        const values = {
            [PreferenceScope.Default]: {
                'editor.fontSize': 14,
                'editor.tabSize': 2,
                'editor.renderWhitespace': 'selection'
            },
            [PreferenceScope.User]: {
                'editor.tabSize': 4,
            },
            [PreferenceScope.Workspace]: {
                'editor.renderWhitespace': 'none',
                '[python].editor.renderWhitespace': 'all',
            },
            [PreferenceScope.Folder]: {
                [workspaceRoot.toString()]: {
                    'editor.fontSize': 12,
                }
            },
        };
        beforeEach(() => preferenceRegistryExtImpl.init(values));
        it('Returns a scoped value when URI is provided', () => {
            const valuesRetrieved = preferenceRegistryExtImpl.getConfiguration(undefined, workspaceRoot).get('editor') as Record<string, unknown>;
            expect(valuesRetrieved.fontSize).equal(12);
        });
        it('Returns a lower-priority scope if the value is undefined in the URI-designated scope', () => {
            const valuesRetrieved = preferenceRegistryExtImpl.getConfiguration(undefined, workspaceRoot).get('editor') as Record<string, unknown>;
            expect(valuesRetrieved.renderWhitespace).equal('none');
        });
        it('Returns a language-overridden value if languageId is provided', () => {
            const valuesRetrieved = preferenceRegistryExtImpl.getConfiguration(undefined, { uri: workspaceRoot, languageId: 'python' }).get('editor') as Record<string, unknown>;
            expect(valuesRetrieved.renderWhitespace).equal('all');
        });
        it('Returns the default value if the language override is undefined', () => {
            const valuesRetrieved = preferenceRegistryExtImpl.getConfiguration(undefined, { uri: workspaceRoot, languageId: 'python' }).get('editor') as Record<string, unknown>;
            expect(valuesRetrieved.tabSize).equal(4);
        });
        it('Allows access to language overrides in bracket form', () => {
            const pythonOverrides = preferenceRegistryExtImpl.getConfiguration().get<Record<string, any>>('[python]');
            expect(pythonOverrides).not.to.be.undefined;
            expect(pythonOverrides?.['editor.renderWhitespace']).equal('all');
        });
        // https://github.com/eclipse-theia/theia/issues/12043
        it('Allows access to preferences without specifying the section', () => {
            const inspection = preferenceRegistryExtImpl.getConfiguration().inspect('editor.fontSize');
            expect(inspection?.defaultValue).equal(14);
        });
    });

    describe('Proxy Behavior', () => {
        const deepConfig = {
            'python.linting.enabled': true,
            'python.linting.flake8Args': [],
            'python.linting.flake8CategorySeverity.E': 'Error',
            'python.linting.flake8CategorySeverity.F': 'Error',
            'python.linting.flake8CategorySeverity.W': 'Warning',
            'python.linting.flake8Enabled': false,
            'python.linting.flake8Path': 'flake8',
            'python.linting.ignorePatterns': ['.vscode/*.py', '**/site-packages/**/*.py'],
            'python.linting.lintOnSave': true,
            'python.linting.maxNumberOfProblems': 100,
            'python.linting.banditArgs': [],
            'python.linting.banditEnabled': false,
            'python.linting.banditPath': 'bandit',
            'python.linting.mypyArgs': [
                '--ignore-missing-imports',
                '--follow-imports=silent',
                '--show-column-numbers'
            ],
            'python.linting.mypyCategorySeverity.error': 'Error',
            'python.linting.mypyCategorySeverity.note': 'Information',
            'python.linting.mypyEnabled': false,
            'python.linting.mypyPath': 'mypy',
        };
        // https://github.com/eclipse-theia/theia/issues/11501
        it("Doesn't violate proxy rules and return a proxy when the underlying object is expected.", () => {
            preferenceRegistryExtImpl.init({
                [PreferenceScope.Default]: deepConfig,
                [PreferenceScope.User]: {},
                [PreferenceScope.Workspace]: {},
                [PreferenceScope.Folder]: {
                    [workspaceRoot.toString()]: {},
                }
            });
            const pythonConfig = preferenceRegistryExtImpl.getConfiguration('python', workspaceRoot);
            const lintConfig = pythonConfig.get<Record<string, unknown>>('linting')!;
            const stringDictionary = Object.create(null);
            Object.keys(lintConfig).forEach(key => {
                stringDictionary[key] = lintConfig[key];
            });
            expect(Boolean('Made it this far without throwing an error')).to.be.true;
        });
    });
});
