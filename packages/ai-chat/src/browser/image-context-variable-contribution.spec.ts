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
import { ILogger, URI } from '@theia/core';
import { LabelProvider, OpenerService } from '@theia/core/lib/browser';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Container, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ImageContextVariableContribution } from './image-context-variable-contribution';
import { PendingImageRegistry } from './pending-image-registry';

disableJSDOM();

@injectable()
class TestImageContextVariableContribution extends ImageContextVariableContribution {
    resolvePath(path: string): Promise<URI | undefined> {
        return this.makeAbsolute(path);
    }
}

describe('ImageContextVariableContribution path resolution', () => {

    const IMAGE = 'file:///ws/theia/images/logo.png';

    let contribution: TestImageContextVariableContribution;

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });

    const setUp = (roots: string[]): void => {
        const container = new Container();
        // A real `WorkspaceService` prototype, so that `getRootPrefixedPath` is the production code.
        const workspaceService = Object.assign(Object.create(WorkspaceService.prototype) as WorkspaceService, {
            tryGetRoots: () => roots.map(root => ({ resource: new URI(root), isDirectory: true }))
        });
        container.bind(WorkspaceService).toConstantValue(workspaceService);
        container.bind(FileService).toConstantValue({ exists: async (uri: URI) => uri.toString() === IMAGE } as unknown as FileService);
        container.bind(OpenerService).toConstantValue({} as OpenerService);
        container.bind(LabelProvider).toConstantValue({} as LabelProvider);
        container.bind(ILogger).to(MockLogger);
        container.bind(PendingImageRegistry).toConstantValue({} as PendingImageRegistry);
        container.bind(TestImageContextVariableContribution).toSelf();
        contribution = container.get(TestImageContextVariableContribution);
    };

    // The chat file picker and drag-and-drop store image paths as `getRootPrefixedPath`, which always has the root prefix.
    const displayedPath = (): string => contribution['wsService'].getRootPrefixedPath(new URI(IMAGE));

    it('resolves the root-prefixed path of an image in a single-root workspace (B3)', async () => {
        setUp(['file:///ws/theia']);
        expect(displayedPath()).to.equal('theia/images/logo.png');
        expect((await contribution.resolvePath(displayedPath()))?.toString()).to.equal(IMAGE);
    });

    it('resolves the root-prefixed path of an image in a multi-root workspace (B3)', async () => {
        setUp(['file:///ws/other', 'file:///ws/theia']);
        expect((await contribution.resolvePath(displayedPath()))?.toString()).to.equal(IMAGE);
    });
});
