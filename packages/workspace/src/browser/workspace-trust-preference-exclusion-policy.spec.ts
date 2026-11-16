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

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { PreferenceExclusionContext, PreferenceScope } from '@theia/core/lib/common/preferences';
import { WorkspaceTrustService } from './workspace-trust-service.js';
import { WorkspaceTrustPreferenceExclusionPolicy } from './workspace-trust-preference-exclusion-policy.js';

disableJSDOM();

class StubWorkspaceTrustService implements Pick<WorkspaceTrustService, 'onDidChangeWorkspaceTrust' | 'currentWorkspaceTrust'> {
    protected readonly onDidChangeWorkspaceTrustEmitter = new Emitter<boolean>();
    readonly onDidChangeWorkspaceTrust = this.onDidChangeWorkspaceTrustEmitter.event;
    currentWorkspaceTrust: boolean | undefined;

    resolveTrust(trusted: boolean): void {
        this.currentWorkspaceTrust = trusted;
        this.onDidChangeWorkspaceTrustEmitter.fire(trusted);
    }

    /** As `WorkspaceTrustService` does when the workspace changes: no event until trust is resolved again. */
    resetTrust(): void {
        this.currentWorkspaceTrust = undefined;
    }
}

describe('WorkspaceTrustPreferenceExclusionPolicy', () => {
    const configUri = new URI('file:///workspace/.theia/settings.json');
    const restricted = (scope: PreferenceScope): PreferenceExclusionContext => ({ scope, configUri, property: { restricted: true } });

    let trust: StubWorkspaceTrustService;
    let policy: WorkspaceTrustPreferenceExclusionPolicy;
    let changes: number;

    beforeEach(() => {
        trust = new StubWorkspaceTrustService();
        const container = new Container();
        container.bind<Pick<WorkspaceTrustService, 'onDidChangeWorkspaceTrust' | 'currentWorkspaceTrust'>>(WorkspaceTrustService).toConstantValue(trust);
        container.bind(WorkspaceTrustPreferenceExclusionPolicy).toSelf().inSingletonScope();
        policy = container.get(WorkspaceTrustPreferenceExclusionPolicy);
        changes = 0;
        policy.onDidChange(() => changes++);
    });

    it('excludes restricted preferences from workspace and folder settings before the trust state is known', () => {
        expect(policy.isExcluded('test.restricted', restricted(PreferenceScope.Workspace))).to.be.true;
        expect(policy.isExcluded('test.restricted', restricted(PreferenceScope.Folder))).to.be.true;
    });

    it('never excludes user settings, unrestricted preferences or preferences without a schema', () => {
        expect(policy.isExcluded('test.restricted', restricted(PreferenceScope.User))).to.be.false;
        expect(policy.isExcluded('test.open', { scope: PreferenceScope.Workspace, configUri, property: { restricted: false } })).to.be.false;
        expect(policy.isExcluded('test.open', { scope: PreferenceScope.Workspace, configUri, property: {} })).to.be.false;
        expect(policy.isExcluded('test.unknown', { scope: PreferenceScope.Workspace, configUri, property: undefined })).to.be.false;
    });

    it('stops excluding, with a change, once the workspace is trusted', () => {
        trust.resolveTrust(true);

        expect(policy.isExcluded('test.restricted', restricted(PreferenceScope.Workspace))).to.be.false;
        expect(changes).to.equal(1);
    });

    it('keeps excluding in an untrusted workspace', () => {
        trust.resolveTrust(false);

        expect(policy.isExcluded('test.restricted', restricted(PreferenceScope.Workspace))).to.be.true;
    });

    it('excludes again when trust is revoked', () => {
        trust.resolveTrust(true);
        trust.resolveTrust(false);

        expect(policy.isExcluded('test.restricted', restricted(PreferenceScope.Folder))).to.be.true;
        expect(changes).to.equal(2);
    });

    it('excludes while trust is resolved again after a workspace change, and fires a change when it resolves to the same state', () => {
        trust.resolveTrust(true);
        trust.resetTrust();

        expect(policy.isExcluded('test.restricted', restricted(PreferenceScope.Folder))).to.be.true;

        trust.resolveTrust(true);

        expect(policy.isExcluded('test.restricted', restricted(PreferenceScope.Folder))).to.be.false;
        expect(changes).to.equal(2);
    });
});
