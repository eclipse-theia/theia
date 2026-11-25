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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { bindContributionProvider, PreferenceExclusionPolicy, PreferenceExclusionService, PreferenceExclusionServiceImpl, PreferenceScope, URI } from '@theia/core/lib/common';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { RestrictedPreferencesContribution } from './restricted-preferences-contribution.js';

disableJSDOM();

class StubWorkspaceTrustService implements Pick<WorkspaceTrustService, 'refreshRestrictedModeIndicator'> {
    refreshed = 0;
    refreshRestrictedModeIndicator(): void {
        this.refreshed++;
    }
}

describe('RestrictedPreferencesContribution', () => {
    const workspaceSettings = new URI('file:///workspace/.theia/settings.json');
    const folderSettings = new URI('file:///workspace/folder/.theia/settings.json');
    const userSettings = new URI('file:///user/settings.json');

    let trust: StubWorkspaceTrustService;
    let exclusions: PreferenceExclusionService;
    let contribution: RestrictedPreferencesContribution;

    beforeEach(() => {
        trust = new StubWorkspaceTrustService();
        const container = new Container();
        bindContributionProvider(container, PreferenceExclusionPolicy);
        container.bind(PreferenceExclusionServiceImpl).toSelf().inSingletonScope();
        container.bind(PreferenceExclusionService).toService(PreferenceExclusionServiceImpl);
        container.bind<Pick<WorkspaceTrustService, 'refreshRestrictedModeIndicator'>>(WorkspaceTrustService).toConstantValue(trust);
        container.bind(RestrictedPreferencesContribution).toSelf().inSingletonScope();
        exclusions = container.get<PreferenceExclusionService>(PreferenceExclusionService);
        contribution = container.get(RestrictedPreferencesContribution);
        contribution.onStart();
    });

    it('reports no restriction while every workspace setting applies', () => {
        expect(contribution.getRestrictions()).to.be.empty;
    });

    it('lists each omitted workspace and folder setting once, sorted', () => {
        exclusions.setExcludedPreferences(workspaceSettings, [
            { preferenceName: 'test.b', scope: PreferenceScope.Workspace, configUri: workspaceSettings },
            { preferenceName: 'test.a', scope: PreferenceScope.Workspace, configUri: workspaceSettings }
        ]);
        exclusions.setExcludedPreferences(folderSettings, [{ preferenceName: 'test.a', scope: PreferenceScope.Folder, configUri: folderSettings }]);
        exclusions.setExcludedPreferences(userSettings, [{ preferenceName: 'test.user', scope: PreferenceScope.User, configUri: userSettings }]);

        const restrictions = contribution.getRestrictions();

        expect(restrictions).to.have.lengthOf(1);
        expect(restrictions[0].details).to.deep.equal(['test.a', 'test.b']);
    });

    it('refreshes the Restricted Mode indicator when the omitted settings change', () => {
        exclusions.setExcludedPreferences(workspaceSettings, [{ preferenceName: 'test.a', scope: PreferenceScope.Workspace, configUri: workspaceSettings }]);

        expect(trust.refreshed).to.equal(1);
    });
});
