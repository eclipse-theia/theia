// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { URI } from '@theia/core';
import { OpenerService } from '@theia/core/lib/browser';
import { Container, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { withWorkspaceServiceDefaults } from '@theia/workspace/lib/browser/test/with-workspace-service-defaults';
import { FileVariableContribution } from './file-variable-contribution';
import { WorkspaceRelativePathResolver } from './workspace-relative-path-resolver';

disableJSDOM();

@injectable()
class TestFileVariableContribution extends FileVariableContribution {
    resolvePath(path: string): Promise<URI | undefined> {
        return this.makeAbsolute(path);
    }
}

describe('FileVariableContribution path resolution', () => {

    const ROOTS = ['file:///alice/app', 'file:///bob/app', 'file:///ws/theia'];
    const FILES = ['file:///alice/app/src/a.ts', 'file:///bob/app/src/a.ts', 'file:///bob/app/src/only-bob.ts', 'file:///ws/theia/README.md'];

    let workspaceService: WorkspaceService;
    let contribution: TestFileVariableContribution;

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        const container = new Container();
        const fileService = { exists: async (uri: URI) => FILES.includes(uri.toString()) } as unknown as FileService;
        workspaceService = withWorkspaceServiceDefaults({
            tryGetRoots: () => ROOTS.map(root => ({ resource: new URI(root), isDirectory: true }))
        });
        container.bind(WorkspaceService).toConstantValue(workspaceService);
        container.bind(FileService).toConstantValue(fileService);
        container.bind(OpenerService).toConstantValue({} as OpenerService);
        container.bind(WorkspaceRelativePathResolver).toSelf();
        container.bind(TestFileVariableContribution).toSelf();
        contribution = container.get(TestFileVariableContribution);
    });

    const resolve = async (path: string): Promise<string | undefined> => (await contribution.resolvePath(path))?.toString();

    it('resolves the root-prefixed path of a file in every root', async () => {
        for (const file of FILES) {
            expect(await resolve(workspaceService.getRootPrefixedPath(new URI(file)))).to.equal(file);
        }
    });

    it('resolves a path prefixed with a basename shared by several roots, as saved by earlier versions', async () => {
        expect(await resolve('app/src/only-bob.ts')).to.equal('file:///bob/app/src/only-bob.ts');
    });

    it('does not resolve a path prefixed with a basename shared by several roots that contain the file', async () => {
        expect(await resolve('app/src/a.ts')).to.be.undefined;
    });

    it('resolves a path without a root name, as saved by earlier versions', async () => {
        expect(await resolve('README.md')).to.equal('file:///ws/theia/README.md');
    });

    it('does not resolve a relative path that leaves its root', async () => {
        FILES.push('file:///alice/secret.txt');
        try {
            expect(await resolve('../secret.txt')).to.be.undefined;
            expect(await resolve('app/../../secret.txt')).to.be.undefined;
        } finally {
            FILES.pop();
        }
    });
});
