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
import {
    WORKSPACE_TRUST_EMPTY_WINDOW,
    WORKSPACE_TRUST_ENABLED,
    WORKSPACE_TRUST_STARTUP_PROMPT,
    WORKSPACE_TRUST_TRUSTED_FOLDERS,
    WorkspaceTrustPrompt
} from '../common/workspace-trust-preferences';
import URI from '@theia/core/lib/common/uri';

class TestableWorkspaceTrustService extends WorkspaceTrustService {
    public async testHandlePreferenceChange(change: PreferenceChange): Promise<void> {
        return this.handlePreferenceChange(change);
    }

    public async testHandleWorkspaceChanged(): Promise<void> {
        return this.handleWorkspaceChanged();
    }

    public setCurrentTrust(trust: boolean | undefined): void {
        this.currentTrust = trust;
    }

    public getCurrentTrust(): boolean | undefined {
        return this.currentTrust;
    }

    public override isWorkspaceTrustResolved(): boolean {
        return super.isWorkspaceTrustResolved();
    }

    public async testCalculateWorkspaceTrust(): Promise<boolean | undefined> {
        return this.calculateWorkspaceTrust();
    }
}

describe('WorkspaceTrustService', () => {
    let service: TestableWorkspaceTrustService;

    beforeEach(() => {
        service = new TestableWorkspaceTrustService();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('calculateWorkspaceTrust', () => {
        let workspaceTrustPrefStub: { [key: string]: unknown };
        let workspaceServiceStub: {
            tryGetRoots: () => Array<{ resource: URI }>;
            workspace: { resource: URI } | undefined;
            saved: boolean;
        };
        let untitledWorkspaceServiceStub: {
            isUntitledWorkspace: (uri?: URI, configDirUri?: URI) => boolean;
        };
        let envVariablesServerStub: {
            getConfigDirUri: () => Promise<string>;
        };

        beforeEach(() => {
            workspaceTrustPrefStub = {
                [WORKSPACE_TRUST_ENABLED]: true,
                [WORKSPACE_TRUST_EMPTY_WINDOW]: false,
                [WORKSPACE_TRUST_STARTUP_PROMPT]: WorkspaceTrustPrompt.NEVER,
                [WORKSPACE_TRUST_TRUSTED_FOLDERS]: []
            };
            workspaceServiceStub = {
                tryGetRoots: () => [],
                workspace: undefined,
                saved: false
            };
            untitledWorkspaceServiceStub = {
                isUntitledWorkspace: () => false
            };
            envVariablesServerStub = {
                getConfigDirUri: async () => 'file:///home/user/.theia'
            };

            (service as unknown as { workspaceTrustPref: typeof workspaceTrustPrefStub }).workspaceTrustPref = workspaceTrustPrefStub;
            (service as unknown as { workspaceService: typeof workspaceServiceStub }).workspaceService = workspaceServiceStub;
            (service as unknown as { untitledWorkspaceService: typeof untitledWorkspaceServiceStub }).untitledWorkspaceService = untitledWorkspaceServiceStub;
            (service as unknown as { envVariablesServer: typeof envVariablesServerStub }).envVariablesServer = envVariablesServerStub;
        });

        it('should return true when trust is disabled', async () => {
            workspaceTrustPrefStub[WORKSPACE_TRUST_ENABLED] = false;

            expect(await service.testCalculateWorkspaceTrust()).to.be.true;
        });

        describe('empty workspace', () => {
            it('should return emptyWindow setting when no workspace is open', async () => {
                workspaceServiceStub.workspace = undefined;
                workspaceTrustPrefStub[WORKSPACE_TRUST_EMPTY_WINDOW] = true;

                expect(await service.testCalculateWorkspaceTrust()).to.be.true;
            });

            it('should return false when emptyWindow is false and no workspace', async () => {
                workspaceServiceStub.workspace = undefined;
                workspaceTrustPrefStub[WORKSPACE_TRUST_EMPTY_WINDOW] = false;

                expect(await service.testCalculateWorkspaceTrust()).to.be.false;
            });

            it('should return emptyWindow setting for untitled workspace with no folders', async () => {
                workspaceServiceStub.workspace = { resource: new URI('file:///home/user/.theia/workspaces/Untitled-123.theia-workspace') };
                workspaceServiceStub.tryGetRoots = () => [];
                untitledWorkspaceServiceStub.isUntitledWorkspace = () => true;
                workspaceTrustPrefStub[WORKSPACE_TRUST_EMPTY_WINDOW] = true;

                expect(await service.testCalculateWorkspaceTrust()).to.be.true;
            });

            it('should not treat saved workspace with no folders as empty', async () => {
                workspaceServiceStub.workspace = { resource: new URI('file:///home/user/my.theia-workspace') };
                workspaceServiceStub.tryGetRoots = () => [];
                workspaceServiceStub.saved = true;
                untitledWorkspaceServiceStub.isUntitledWorkspace = () => false;
                workspaceTrustPrefStub[WORKSPACE_TRUST_EMPTY_WINDOW] = true;

                // Should return false because saved workspace with 0 folders is not "empty"
                // and the workspace file is not trusted
                expect(await service.testCalculateWorkspaceTrust()).to.be.false;
            });
        });

        describe('single-root workspace', () => {
            it('should return true when folder is in trusted folders', async () => {
                workspaceTrustPrefStub[WORKSPACE_TRUST_TRUSTED_FOLDERS] = ['file:///home/user/project'];
                workspaceServiceStub.workspace = { resource: new URI('file:///home/user/project') };
                workspaceServiceStub.tryGetRoots = () => [
                    { resource: new URI('file:///home/user/project') }
                ];

                expect(await service.testCalculateWorkspaceTrust()).to.be.true;
            });

            it('should return true when parent folder is trusted', async () => {
                workspaceTrustPrefStub[WORKSPACE_TRUST_TRUSTED_FOLDERS] = ['file:///home/user'];
                workspaceServiceStub.workspace = { resource: new URI('file:///home/user/project') };
                workspaceServiceStub.tryGetRoots = () => [
                    { resource: new URI('file:///home/user/project') }
                ];

                expect(await service.testCalculateWorkspaceTrust()).to.be.true;
            });

            it('should return false when folder is not trusted', async () => {
                workspaceTrustPrefStub[WORKSPACE_TRUST_TRUSTED_FOLDERS] = ['file:///home/other'];
                workspaceServiceStub.workspace = { resource: new URI('file:///home/user/project') };
                workspaceServiceStub.tryGetRoots = () => [
                    { resource: new URI('file:///home/user/project') }
                ];

                expect(await service.testCalculateWorkspaceTrust()).to.be.false;
            });
        });

        describe('multi-root workspace', () => {
            it('should return true when all folders are trusted', async () => {
                workspaceTrustPrefStub[WORKSPACE_TRUST_TRUSTED_FOLDERS] = [
                    'file:///home/user/project1',
                    'file:///home/user/project2'
                ];
                workspaceServiceStub.workspace = { resource: new URI('file:///home/user/my.theia-workspace') };
                workspaceServiceStub.tryGetRoots = () => [
                    { resource: new URI('file:///home/user/project1') },
                    { resource: new URI('file:///home/user/project2') }
                ];

                expect(await service.testCalculateWorkspaceTrust()).to.be.true;
            });

            it('should return false when one folder is not trusted', async () => {
                workspaceTrustPrefStub[WORKSPACE_TRUST_TRUSTED_FOLDERS] = ['file:///home/user/project1'];
                workspaceServiceStub.workspace = { resource: new URI('file:///home/user/my.theia-workspace') };
                workspaceServiceStub.tryGetRoots = () => [
                    { resource: new URI('file:///home/user/project1') },
                    { resource: new URI('file:///home/user/project2') }
                ];

                expect(await service.testCalculateWorkspaceTrust()).to.be.false;
            });

            it('should return true when parent folder covers all roots', async () => {
                workspaceTrustPrefStub[WORKSPACE_TRUST_TRUSTED_FOLDERS] = ['file:///home/user'];
                workspaceServiceStub.workspace = { resource: new URI('file:///home/user/my.theia-workspace') };
                workspaceServiceStub.tryGetRoots = () => [
                    { resource: new URI('file:///home/user/project1') },
                    { resource: new URI('file:///home/user/project2') }
                ];

                expect(await service.testCalculateWorkspaceTrust()).to.be.true;
            });
        });

        describe('saved workspace file trust', () => {
            it('should require workspace file to be trusted for saved workspaces', async () => {
                // Folder is trusted but workspace file location is not
                workspaceTrustPrefStub[WORKSPACE_TRUST_TRUSTED_FOLDERS] = ['file:///home/user/project'];
                workspaceServiceStub.workspace = { resource: new URI('file:///other/location/my.theia-workspace') };
                workspaceServiceStub.saved = true;
                workspaceServiceStub.tryGetRoots = () => [
                    { resource: new URI('file:///home/user/project') }
                ];

                expect(await service.testCalculateWorkspaceTrust()).to.be.false;
            });

            it('should return true when both folder and workspace file are trusted', async () => {
                workspaceTrustPrefStub[WORKSPACE_TRUST_TRUSTED_FOLDERS] = ['file:///home/user'];
                workspaceServiceStub.workspace = { resource: new URI('file:///home/user/my.theia-workspace') };
                workspaceServiceStub.saved = true;
                workspaceServiceStub.tryGetRoots = () => [
                    { resource: new URI('file:///home/user/project') }
                ];

                expect(await service.testCalculateWorkspaceTrust()).to.be.true;
            });

            it('should not require workspace file trust for unsaved workspaces', async () => {
                workspaceTrustPrefStub[WORKSPACE_TRUST_TRUSTED_FOLDERS] = ['file:///home/user/project'];
                workspaceServiceStub.workspace = { resource: new URI('file:///tmp/untitled.theia-workspace') };
                workspaceServiceStub.saved = false;
                workspaceServiceStub.tryGetRoots = () => [
                    { resource: new URI('file:///home/user/project') }
                ];

                expect(await service.testCalculateWorkspaceTrust()).to.be.true;
            });
        });
    });

    describe('handleWorkspaceChanged', () => {
        let resolveWorkspaceTrustStub: sinon.SinonStub;
        let getWorkspaceTrustStub: sinon.SinonStub;
        let updateRestrictedModeIndicatorStub: sinon.SinonStub;

        beforeEach(() => {
            resolveWorkspaceTrustStub = sinon.stub(service as unknown as { resolveWorkspaceTrust: () => Promise<void> }, 'resolveWorkspaceTrust').resolves();
            getWorkspaceTrustStub = sinon.stub(service, 'getWorkspaceTrust').resolves(true);
            updateRestrictedModeIndicatorStub = sinon.stub(
                service as unknown as { updateRestrictedModeIndicator: (trust: boolean) => void },
                'updateRestrictedModeIndicator'
            );
        });

        it('should reset trust state when workspace changes', async () => {
            service.setCurrentTrust(true);

            await service.testHandleWorkspaceChanged();

            expect(service.getCurrentTrust()).to.be.undefined;
        });

        it('should re-evaluate trust when workspace changes', async () => {
            service.setCurrentTrust(true);

            await service.testHandleWorkspaceChanged();

            expect(resolveWorkspaceTrustStub.calledOnce).to.be.true;
        });

        it('should update restricted mode indicator after workspace change if not trusted', async () => {
            getWorkspaceTrustStub.resolves(false);

            await service.testHandleWorkspaceChanged();

            expect(updateRestrictedModeIndicatorStub.calledOnceWith(false)).to.be.true;
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
        let areAllWorkspaceUrisTrustedStub: sinon.SinonStub;
        let setWorkspaceTrustStub: sinon.SinonStub;
        let isEmptyWorkspaceStub: sinon.SinonStub;
        let workspaceTrustPrefStub: { [key: string]: unknown };

        beforeEach(() => {
            areAllWorkspaceUrisTrustedStub = sinon.stub(service as unknown as { areAllWorkspaceUrisTrusted: () => Promise<boolean> }, 'areAllWorkspaceUrisTrusted');
            setWorkspaceTrustStub = sinon.stub(service, 'setWorkspaceTrust');
            isEmptyWorkspaceStub = sinon.stub(service as unknown as { isEmptyWorkspace: () => Promise<boolean> }, 'isEmptyWorkspace');
            // Mock workspaceTrustPref - default emptyWindow to false so trusted folders logic runs
            workspaceTrustPrefStub = { [WORKSPACE_TRUST_EMPTY_WINDOW]: false };
            (service as unknown as { workspaceTrustPref: { [key: string]: unknown } }).workspaceTrustPref = workspaceTrustPrefStub;
            // Default to non-empty workspace
            isEmptyWorkspaceStub.resolves(false);
        });

        it('should update trust to true when all workspace URIs become trusted', async () => {
            service.setCurrentTrust(false);
            areAllWorkspaceUrisTrustedStub.resolves(true);

            const change: PreferenceChange = {
                preferenceName: WORKSPACE_TRUST_TRUSTED_FOLDERS,
                scope: PreferenceScope.User,
                domain: [],
                affects: () => true
            };

            await service.testHandlePreferenceChange(change);

            expect(setWorkspaceTrustStub.calledOnceWith(true)).to.be.true;
        });

        it('should update trust to false when not all workspace URIs are trusted', async () => {
            service.setCurrentTrust(true);
            areAllWorkspaceUrisTrustedStub.resolves(false);

            const change: PreferenceChange = {
                preferenceName: WORKSPACE_TRUST_TRUSTED_FOLDERS,
                scope: PreferenceScope.User,
                domain: [],
                affects: () => true
            };

            await service.testHandlePreferenceChange(change);

            expect(setWorkspaceTrustStub.calledOnceWith(false)).to.be.true;
        });

        it('should not update trust when trustedFolders change does not affect trust status', async () => {
            service.setCurrentTrust(false);
            areAllWorkspaceUrisTrustedStub.resolves(false);

            const change: PreferenceChange = {
                preferenceName: WORKSPACE_TRUST_TRUSTED_FOLDERS,
                scope: PreferenceScope.User,
                domain: [],
                affects: () => true
            };

            await service.testHandlePreferenceChange(change);

            expect(setWorkspaceTrustStub.called).to.be.false;
        });

        describe('emptyWindow setting changes', () => {
            beforeEach(() => {
                // Reset to empty workspace for empty window tests
                isEmptyWorkspaceStub.resolves(true);
            });

            it('should update trust to true when emptyWindow setting changes to true for empty window', async () => {
                service.setCurrentTrust(false);
                workspaceTrustPrefStub[WORKSPACE_TRUST_EMPTY_WINDOW] = true;

                const change: PreferenceChange = {
                    preferenceName: WORKSPACE_TRUST_EMPTY_WINDOW,
                    scope: PreferenceScope.User,
                    domain: [],
                    affects: () => true
                };

                await service.testHandlePreferenceChange(change);

                expect(setWorkspaceTrustStub.calledOnceWith(true)).to.be.true;
            });

            it('should update trust to false when emptyWindow setting changes to false for empty window', async () => {
                service.setCurrentTrust(true);

                const change: PreferenceChange = {
                    preferenceName: WORKSPACE_TRUST_EMPTY_WINDOW,
                    scope: PreferenceScope.User,
                    domain: [],
                    affects: () => true
                };

                await service.testHandlePreferenceChange(change);

                expect(setWorkspaceTrustStub.calledOnceWith(false)).to.be.true;
            });

            it('should not update trust when emptyWindow setting changes but workspace has roots', async () => {
                service.setCurrentTrust(false);
                isEmptyWorkspaceStub.resolves(false);

                const change: PreferenceChange = {
                    preferenceName: WORKSPACE_TRUST_EMPTY_WINDOW,
                    scope: PreferenceScope.User,
                    domain: [],
                    affects: () => true
                };

                await service.testHandlePreferenceChange(change);

                expect(setWorkspaceTrustStub.called).to.be.false;
            });

            it('should not update trust when emptyWindow setting changes but trust already matches', async () => {
                service.setCurrentTrust(true);
                workspaceTrustPrefStub[WORKSPACE_TRUST_EMPTY_WINDOW] = true;

                const change: PreferenceChange = {
                    preferenceName: WORKSPACE_TRUST_EMPTY_WINDOW,
                    scope: PreferenceScope.User,
                    domain: [],
                    affects: () => true
                };

                await service.testHandlePreferenceChange(change);

                expect(setWorkspaceTrustStub.called).to.be.false;
            });
        });

        describe('trustedFolders change for empty window with emptyWindow enabled', () => {
            beforeEach(() => {
                isEmptyWorkspaceStub.resolves(true);
                workspaceTrustPrefStub[WORKSPACE_TRUST_EMPTY_WINDOW] = true;
            });

            it('should not change trust when trustedFolders change for empty window with emptyWindow enabled', async () => {
                service.setCurrentTrust(true);

                const change: PreferenceChange = {
                    preferenceName: WORKSPACE_TRUST_TRUSTED_FOLDERS,
                    scope: PreferenceScope.User,
                    domain: [],
                    affects: () => true
                };

                await service.testHandlePreferenceChange(change);

                expect(setWorkspaceTrustStub.called).to.be.false;
            });
        });
    });
});
