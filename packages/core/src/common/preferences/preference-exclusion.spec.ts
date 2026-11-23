// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
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
import { Container } from 'inversify';
import { bindContributionProvider } from '../contribution-provider.js';
import { Emitter } from '../event.js';
import URI from '../uri.js';
import {
    ExcludedPreference, PreferenceExclusionContext, PreferenceExclusionPolicy, PreferenceExclusionService, PreferenceExclusionServiceImpl
} from './preference-exclusion.js';
import { PreferenceScope } from './preference-scope.js';

class NamePolicy implements PreferenceExclusionPolicy {
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(protected excludedName: string) { }

    exclude(preferenceName: string): void {
        this.excludedName = preferenceName;
        this.onDidChangeEmitter.fire();
    }

    isExcluded(preferenceName: string): boolean {
        return preferenceName === this.excludedName;
    }
}

describe('PreferenceExclusionService', () => {
    const settings = new URI('file:///workspace/.theia/settings.json');
    const context: PreferenceExclusionContext = { scope: PreferenceScope.Workspace, configUri: settings, property: undefined };

    let container: Container;
    let service: PreferenceExclusionService;
    let first: NamePolicy;
    let second: NamePolicy;

    beforeEach(() => {
        container = new Container();
        bindContributionProvider(container, PreferenceExclusionPolicy);
        container.bind(PreferenceExclusionServiceImpl).toSelf().inSingletonScope();
        container.bind(PreferenceExclusionService).toService(PreferenceExclusionServiceImpl);
        first = new NamePolicy('test.first');
        second = new NamePolicy('test.second');
        container.bind(PreferenceExclusionPolicy).toConstantValue(first);
        container.bind(PreferenceExclusionPolicy).toConstantValue(second);
        service = container.get<PreferenceExclusionService>(PreferenceExclusionService);
    });

    it('excludes a preference that any policy excludes', () => {
        expect(service.isExcluded('test.first', context)).to.be.true;
        expect(service.isExcluded('test.second', context)).to.be.true;
        expect(service.isExcluded('test.other', context)).to.be.false;
    });

    it('excludes nothing without a policy', () => {
        const empty = new Container();
        bindContributionProvider(empty, PreferenceExclusionPolicy);
        empty.bind(PreferenceExclusionServiceImpl).toSelf().inSingletonScope();

        expect(empty.get(PreferenceExclusionServiceImpl).isExcluded('test.first', context)).to.be.false;
    });

    it('fires a change when a policy changes', () => {
        let fired = 0;
        service.onDidChange(() => fired++);
        expect(service.isExcluded('test.other', context)).to.be.false;

        second.exclude('test.other');

        expect(fired).to.equal(1);
        expect(service.isExcluded('test.other', context)).to.be.true;
    });

    it('lists the excluded preferences that providers report, and fires only when they change', () => {
        const workspace: ExcludedPreference = { preferenceName: 'test.first', scope: PreferenceScope.Workspace, configUri: settings };
        const folder: ExcludedPreference = { preferenceName: 'test.second', scope: PreferenceScope.Folder, configUri: new URI('file:///folder/.theia/settings.json') };
        let fired = 0;
        service.onDidChangeExcludedPreferences(() => fired++);

        service.setExcludedPreferences(workspace.configUri, [workspace]);
        service.setExcludedPreferences(folder.configUri, [folder]);
        service.setExcludedPreferences(folder.configUri, [folder]);

        expect(fired).to.equal(2);
        expect(service.getExcludedPreferences()).to.deep.equal([workspace, folder]);
        expect(service.getExcludedPreferences(PreferenceScope.Folder)).to.deep.equal([folder]);

        service.setExcludedPreferences(workspace.configUri, []);

        expect(fired).to.equal(3);
        expect(service.getExcludedPreferences()).to.deep.equal([folder]);

        const other: ExcludedPreference = { ...folder, preferenceName: 'test.other' };
        service.setExcludedPreferences(folder.configUri, [other]);

        expect(fired).to.equal(4);
        expect(service.getExcludedPreferences()).to.deep.equal([other]);
    });
});
