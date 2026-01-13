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

    public setCurrentTrust(trust: boolean): void {
        this.currentTrust = trust;
    }

    public getCurrentTrust(): boolean | undefined {
        return this.currentTrust;
    }
}

describe('WorkspaceTrustService', () => {
    let service: TestableWorkspaceTrustService;

    beforeEach(() => {
        service = new TestableWorkspaceTrustService();
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
