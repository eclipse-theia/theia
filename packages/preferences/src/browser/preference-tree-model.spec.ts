// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { Event, PreferenceDataProperty, PreferenceSchemaService, PreferenceService } from '@theia/core';
import {
    Tree,
    TreeSelectionService,
    TreeExpansionService,
    TreeNavigationService,
    TreeSearch,
} from '@theia/core/lib/browser';
import { TreeFocusService } from '@theia/core/lib/browser/tree/tree-focus-service';
import { PreferencesSearchbarWidget } from './views/preference-searchbar-widget';
import { PreferenceTreeGenerator } from './util/preference-tree-generator';
import { PreferencesScopeTabBar } from './views/preference-scope-tabbar-widget';
import { PreferenceTreeModel } from './preference-tree-model';

disableJSDOM();

describe('PreferenceTreeModel', () => {

    let preferenceTreeModel: PreferenceTreeModel;
    let mockPreferenceService: Partial<PreferenceService>;
    let mockSchemaProvider: Partial<PreferenceSchemaService>;
    let schemaProperties: Map<string, PreferenceDataProperty>;

    beforeEach(() => {
        schemaProperties = new Map();

        mockPreferenceService = {
            get: <T>(_prefId: string): T | undefined => undefined,
            ready: Promise.resolve(),
            onPreferenceChanged: Event.None,
        };

        mockSchemaProvider = {
            getSchemaProperties: () => schemaProperties,
            isValidInScope: () => true,
        };

        const container = new Container();

        // TreeModelImpl dependencies
        container.bind(ILogger).toConstantValue({ debug: () => { }, warn: () => { }, error: () => { } } as any);
        container.bind(Tree).toConstantValue({
            root: undefined,
            onChanged: Event.None,
            dispose: () => { },
        } as any);
        container.bind(TreeSelectionService).toConstantValue({
            selectedNodes: [],
            onSelectionChanged: Event.None,
            dispose: () => { },
        } as any);
        container.bind(TreeExpansionService).toConstantValue({
            onExpansionChanged: Event.None,
            dispose: () => { },
        } as any);
        container.bind(TreeNavigationService).toConstantValue({} as any);
        container.bind(TreeFocusService).toConstantValue({} as any);
        container.bind(TreeSearch).toConstantValue({
            dispose: () => { },
        } as any);

        // PreferenceTreeModel dependencies
        container.bind(PreferenceSchemaService).toConstantValue(mockSchemaProvider as PreferenceSchemaService);
        container.bind(PreferencesSearchbarWidget).toConstantValue({
            onFilterChanged: Event.None,
            updateResultsCount: () => { },
        } as any);
        container.bind(PreferenceTreeGenerator).toConstantValue({
            onSchemaChanged: Event.None,
            root: { children: [] },
        } as any);
        container.bind(PreferencesScopeTabBar).toConstantValue({
            onScopeChanged: Event.None,
            currentScope: { scope: 1, uri: undefined, activeScopeIsFolder: false },
        } as any);
        container.bind(PreferenceService).toConstantValue(mockPreferenceService as PreferenceService);

        container.bind(PreferenceTreeModel).toSelf().inSingletonScope();
        preferenceTreeModel = container.get(PreferenceTreeModel);
    });

    describe('passesVisibleWhenCondition', () => {

        const passesVisibleWhenCondition = (property: PreferenceDataProperty): boolean => preferenceTreeModel['passesVisibleWhenCondition'](property);

        describe('when no visibleWhen condition is specified', () => {
            it('should return true', () => {
                const property: PreferenceDataProperty = {
                    type: 'string'
                };
                expect(passesVisibleWhenCondition(property)).to.be.true;
            });

            it('should return true for undefined visibleWhen', () => {
                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: undefined
                };
                expect(passesVisibleWhenCondition(property)).to.be.true;
            });
        });

        /** Visibility defaults to true on mistakes in the formulation to avoid accidentally hiding preferences. */
        describe('when visibleWhen has invalid format', () => {
            it('should return true for empty string', () => {
                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: ''
                };
                expect(passesVisibleWhenCondition(property)).to.be.true;
            });

            it('should return true for malformed expression without config prefix', () => {
                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: "some.pref == 'value'"
                };
                expect(passesVisibleWhenCondition(property)).to.be.true;
            });

            it('should return true for expression without quotes', () => {
                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: 'config.some.pref == value'
                };
                expect(passesVisibleWhenCondition(property)).to.be.true;
            });

            it('should return true for expression with invalid operator', () => {
                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: "config.some.pref === 'value'"
                };
                expect(passesVisibleWhenCondition(property)).to.be.true;
            });

            it('should return true for expression with greater than operator', () => {
                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: "config.some.pref > 'value'"
                };
                expect(passesVisibleWhenCondition(property)).to.be.true;
            });
        });

        describe('when visibleWhen uses equality operator (==)', () => {
            it('should return true when preference value matches', () => {
                mockPreferenceService.get = <T>(prefId: string): T | undefined =>
                    (prefId === 'test.scope' ? 'workspace' : undefined) as T | undefined;

                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: "config.test.scope == 'workspace'"
                };
                expect(passesVisibleWhenCondition(property)).to.be.true;
            });

            it('should return false when preference value does not match', () => {
                mockPreferenceService.get = <T>(prefId: string): T | undefined =>
                    (prefId === 'test.scope' ? 'global' : undefined) as T | undefined;

                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: "config.test.scope == 'workspace'"
                };
                expect(passesVisibleWhenCondition(property)).to.be.false;
            });

            it('should return false when preference value is undefined', () => {
                mockPreferenceService.get = () => undefined;

                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: "config.test.scope == 'workspace'"
                };
                expect(passesVisibleWhenCondition(property)).to.be.false;
            });

            it('should handle empty string comparison', () => {
                mockPreferenceService.get = () => '' as any;

                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: "config.test.path == ''"
                };
                expect(passesVisibleWhenCondition(property)).to.be.true;
            });

            it('should not need whitespace', () => {
                mockPreferenceService.get = <T>(prefId: string): T | undefined =>
                    (prefId === 'test.scope' ? 'global' : undefined) as T | undefined;

                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: "config.test.scope=='workspace'"
                };
                expect(passesVisibleWhenCondition(property)).to.be.false;
            });

            it('should support double quotation marks', () => {
                mockPreferenceService.get = <T>(prefId: string): T | undefined =>
                    (prefId === 'test.scope' ? 'global' : undefined) as T | undefined;

                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: 'config.test.scope=="workspace"'
                };
                expect(passesVisibleWhenCondition(property)).to.be.false;
            });
        });

        describe('when visibleWhen uses inequality operator (!=)', () => {
            it('should return true when preference value does not match', () => {
                mockPreferenceService.get = <T>(prefId: string): T | undefined =>
                    (prefId === 'test.scope' ? 'global' : undefined) as T | undefined;

                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: "config.test.scope != workspace'"
                };
                expect(passesVisibleWhenCondition(property)).to.be.true;
            });

            it('should return false when preference value matches', () => {
                mockPreferenceService.get = <T>(prefId: string): T | undefined =>
                    (prefId === 'test.scope' ? 'workspace' : undefined) as T | undefined;

                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: "config.test.scope != 'workspace'"
                };
                expect(passesVisibleWhenCondition(property)).to.be.false;
            });

            it('should return true when preference value is undefined', () => {
                mockPreferenceService.get = () => undefined;

                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: "config.test.scope != 'workspace'"
                };
                expect(passesVisibleWhenCondition(property)).to.be.true;
            });

            it('should not need whitespace', () => {
                mockPreferenceService.get = <T>(prefId: string): T | undefined =>
                    (prefId === 'test.scope' ? 'workspace' : undefined) as T | undefined;

                const property: PreferenceDataProperty = {
                    type: 'string',
                    visibleWhen: "config.test.scope!='workspace'"
                };
                expect(passesVisibleWhenCondition(property)).to.be.false;
            });
        });
    });

    describe('hasVisibleWhenDependency', () => {
        const hasVisibleWhenDependency = (id: string): boolean => preferenceTreeModel['hasVisibleWhenDependency'](id);

        it('should return false when no preferences have visibleWhen', () => {
            schemaProperties.set('pref1', { type: 'string' });
            schemaProperties.set('pref2', { type: 'boolean' });

            expect(hasVisibleWhenDependency('some.preference')).to.be.false;
        });

        it('should return true when a preference depends on the changed preference', () => {
            schemaProperties.set('pref1', { type: 'string' });
            schemaProperties.set('pref2', {
                type: 'string',
                visibleWhen: "config.some.preference == 'value'"
            });

            expect(hasVisibleWhenDependency('some.preference')).to.be.true;
        });

        it('should return false when no preference depends on the changed preference', () => {
            schemaProperties.set('pref1', { type: 'string' });
            schemaProperties.set('pref2', {
                type: 'string',
                visibleWhen: "config.other.preference == 'value'"
            });

            expect(hasVisibleWhenDependency('some.preference')).to.be.false;
        });

        it('should return true when multiple preferences depend on the changed preference', () => {
            schemaProperties.set('pref1', {
                type: 'string',
                visibleWhen: "config.scope.setting == 'workspace'"
            });
            schemaProperties.set('pref2', {
                type: 'string',
                visibleWhen: "config.scope.setting == 'global'"
            });
            schemaProperties.set('pref3', { type: 'boolean' });

            expect(hasVisibleWhenDependency('scope.setting')).to.be.true;
        });

        it('should handle partial preference ID matches correctly', () => {
            schemaProperties.set('pref1', {
                type: 'string',
                visibleWhen: "config.my.setting.scope == 'value'"
            });

            // Should not match partial ID
            expect(hasVisibleWhenDependency('my.setting')).to.be.false;
            // Should match exact ID
            expect(hasVisibleWhenDependency('my.setting.scope')).to.be.true;
        });

        it('should not need whitespace', () => {
            schemaProperties.set('pref1', {
                type: 'string',
                visibleWhen: "config.my.setting.scope=='value'"
            });

            expect(hasVisibleWhenDependency('my.setting.scope')).to.be.true;
        });
    });
});
