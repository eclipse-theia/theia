// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import * as sinon from 'sinon';
import { PreferenceChange, PreferenceScope } from '@theia/core/lib/common/preferences';
import { WorkspaceTrustService } from './workspace-trust-service';
import { WORKSPACE_TRUST_TRUSTED_FOLDERS } from '../common/workspace-trust-preferences';

class TestableWorkspaceTrustService extends WorkspaceTrustService {
    public async testHandlePreferenceChange(change: PreferenceChange): Promise<void> {
        return this.handlePreferenceChange(change);
    }

    public async testHandleWorkspaceChanged(): Promise<void> {
        return this.handleWorkspaceChanged();
    }

    public setCurrentTrust(trust: boolean): void {
        this.currentTrust = trust;
    }

    public getCurrentTrust(): boolean | undefined {
        return this.currentTrust;
    }

    public getRestrictedModeNotificationShown(): boolean {
        return this.restrictedModeNotificationShown;
    }

    public setRestrictedModeNotificationShown(value: boolean): void {
        this.restrictedModeNotificationShown = value;
    }

    public override isWorkspaceTrustResolved(): boolean {
        return super.isWorkspaceTrustResolved();
    }
}

describe('WorkspaceTrustService', () => {
    let service: TestableWorkspaceTrustService;

    beforeEach(() => {
        service = new TestableWorkspaceTrustService();
    });

    describe('handleWorkspaceChanged', () => {
        let resolveWorkspaceTrustStub: sinon.SinonStub;
        let getWorkspaceTrustStub: sinon.SinonStub;
        let updateRestrictedModeNotificationStub: sinon.SinonStub;

        beforeEach(() => {
            resolveWorkspaceTrustStub = sinon.stub(service as unknown as { resolveWorkspaceTrust: () => Promise<void> }, 'resolveWorkspaceTrust').resolves();
            getWorkspaceTrustStub = sinon.stub(service, 'getWorkspaceTrust').resolves(true);
            updateRestrictedModeNotificationStub = sinon.stub(
                service as unknown as { updateRestrictedModeNotification: (trust: boolean) => void },
                'updateRestrictedModeNotification'
            );
        });

        afterEach(() => {
            sinon.restore();
        });

        it('should reset trust state when workspace changes', async () => {
            service.setCurrentTrust(true);
            service.setRestrictedModeNotificationShown(true);

            await service.testHandleWorkspaceChanged();

            expect(service.getCurrentTrust()).to.be.undefined;
            expect(service.getRestrictedModeNotificationShown()).to.be.false;
        });

        it('should re-evaluate trust when workspace changes', async () => {
            service.setCurrentTrust(true);

            await service.testHandleWorkspaceChanged();

            expect(resolveWorkspaceTrustStub.calledOnce).to.be.true;
        });

        it('should show restricted mode notification after workspace change if not trusted', async () => {
            getWorkspaceTrustStub.resolves(false);

            await service.testHandleWorkspaceChanged();

            expect(updateRestrictedModeNotificationStub.calledOnceWith(false)).to.be.true;
        });

        it('should reset workspaceTrust deferred to unresolved state', async () => {
            // First resolve the trust
            service.setCurrentTrust(true);

            await service.testHandleWorkspaceChanged();

            // After workspace change, it should be reset and resolved again via resolveWorkspaceTrust
            expect(resolveWorkspaceTrustStub.calledOnce).to.be.true;
        });
    });

    describe('handlePreferenceChange', () => {
        let isWorkspaceInTrustedFoldersStub: sinon.SinonStub;
        let setWorkspaceTrustStub: sinon.SinonStub;

        beforeEach(() => {
            isWorkspaceInTrustedFoldersStub = sinon.stub(service as unknown as { isWorkspaceInTrustedFolders: () => boolean }, 'isWorkspaceInTrustedFolders');
            setWorkspaceTrustStub = sinon.stub(service, 'setWorkspaceTrust');
        });

        afterEach(() => {
            sinon.restore();
        });

        it('should update trust to true when folder is added to trustedFolders', async () => {
            service.setCurrentTrust(false);
            isWorkspaceInTrustedFoldersStub.returns(true);

            const change: PreferenceChange = {
                preferenceName: WORKSPACE_TRUST_TRUSTED_FOLDERS,
                scope: PreferenceScope.User,
                domain: [],
                newValue: ['/some/path'],
                oldValue: [],
                affects: () => true
            };

            await service.testHandlePreferenceChange(change);

            expect(setWorkspaceTrustStub.calledOnceWith(true)).to.be.true;
        });

        it('should update trust to false when folder is removed from trustedFolders', async () => {
            service.setCurrentTrust(true);
            isWorkspaceInTrustedFoldersStub.returns(false);

            const change: PreferenceChange = {
                preferenceName: WORKSPACE_TRUST_TRUSTED_FOLDERS,
                scope: PreferenceScope.User,
                domain: [],
                newValue: [],
                oldValue: ['/some/path'],
                affects: () => true
            };

            await service.testHandlePreferenceChange(change);

            expect(setWorkspaceTrustStub.calledOnceWith(false)).to.be.true;
        });

        it('should not update trust when trustedFolders change does not affect current workspace', async () => {
            service.setCurrentTrust(false);
            isWorkspaceInTrustedFoldersStub.returns(false);

            const change: PreferenceChange = {
                preferenceName: WORKSPACE_TRUST_TRUSTED_FOLDERS,
                scope: PreferenceScope.User,
                domain: [],
                newValue: ['/other/path'],
                oldValue: [],
                affects: () => true
            };

            await service.testHandlePreferenceChange(change);

            expect(setWorkspaceTrustStub.called).to.be.false;
        });
    });
});
