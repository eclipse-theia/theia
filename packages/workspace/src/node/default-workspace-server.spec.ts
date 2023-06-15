// *****************************************************************************
// Copyright (C) 2022 Alexander Flammer and others.
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
import { MockEnvVariablesServerImpl } from '@theia/core/lib/browser/test/mock-env-variables-server';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node';
import { WorkspaceFileService, UntitledWorkspaceService } from '../common';
import { DefaultWorkspaceServer, WorkspaceCliContribution } from './default-workspace-server';
import { expect } from 'chai';
import * as temp from 'temp';
import * as fs from 'fs';

describe('DefaultWorkspaceServer', function (): void {

    describe('getRecentWorkspaces()', async () => {
        let workspaceServer: DefaultWorkspaceServer;
        let tmpConfigDir: URI;
        let recentWorkspaceFile: string;

        beforeEach(() => {
            // create a temporary directory
            const tempDirPath = temp.track().mkdirSync();
            tmpConfigDir = FileUri.create(fs.realpathSync(tempDirPath));
            recentWorkspaceFile = FileUri.fsPath(tmpConfigDir.resolve('recentworkspace.json'));

            // create a container with the necessary bindings for the DefaultWorkspaceServer
            const container = new Container();
            container.bind(WorkspaceCliContribution).toSelf().inSingletonScope();
            container.bind(DefaultWorkspaceServer).toSelf().inSingletonScope();
            container.bind(WorkspaceFileService).toSelf().inSingletonScope();
            container.bind(UntitledWorkspaceService).toSelf().inSingletonScope();
            container.bind(EnvVariablesServer).toConstantValue(new MockEnvVariablesServerImpl(tmpConfigDir));

            workspaceServer = container.get(DefaultWorkspaceServer);
        });

        it('should return empty list of workspaces if no recent workspaces file is existing', async function (): Promise<void> {
            const recent = await workspaceServer.getRecentWorkspaces();
            expect(recent).to.be.empty;
        });

        it('should not return non-existing workspaces from recent workspaces file', async function (): Promise<void> {
            fs.writeFileSync(recentWorkspaceFile, JSON.stringify({
                recentRoots: [
                    tmpConfigDir.resolve('somethingNotExisting').toString(),
                    tmpConfigDir.resolve('somethingElseNotExisting').toString()
                ]
            }));

            const recent = await workspaceServer.getRecentWorkspaces();

            expect(recent).to.be.empty;
        });

        it('should return only existing workspaces from recent workspaces file', async function (): Promise<void> {
            fs.writeFileSync(recentWorkspaceFile, JSON.stringify({
                recentRoots: [
                    tmpConfigDir.toString(),
                    tmpConfigDir.resolve('somethingNotExisting').toString()
                ]
            }));

            const recent = await workspaceServer.getRecentWorkspaces();

            expect(recent).to.have.members([tmpConfigDir.toString()]);
        });

        it('should ignore non-string array entries but return remaining existing file paths', async function (): Promise<void> {
            // previously caused: 'TypeError: Cannot read property 'fsPath' of undefined', see issue #10250
            fs.writeFileSync(recentWorkspaceFile, JSON.stringify({
                recentRoots: [
                    [tmpConfigDir.toString()],
                    {},
                    12345678,
                    undefined,
                    tmpConfigDir.toString(),
                ]
            }));

            const recent = await workspaceServer.getRecentWorkspaces();

            expect(recent).to.have.members([tmpConfigDir.toString()]);
        });
    });
});
