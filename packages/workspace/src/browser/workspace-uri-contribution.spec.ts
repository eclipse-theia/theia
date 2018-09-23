/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { WorkspaceUriLabelProviderContribution } from './workspace-uri-contribution';
import { Container, ContainerModule, injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { IWorkspaceService } from './workspace-service';
import { FileStat, FileSystem } from '@theia/filesystem/lib/common/filesystem';
import { expect } from 'chai';
import { MockFilesystem } from '@theia/filesystem/lib/common/test';

let labelProvider: WorkspaceUriLabelProviderContribution;

@injectable()
class MockWorkspaceService implements IWorkspaceService {
    get roots(): Promise<FileStat[]> {
        const stat: FileStat = {
            uri: 'file:///workspace',
            lastModification: 0,
            isDirectory: true,
        };
        return Promise.resolve([stat]);
    }
}

beforeEach(function() {

    const module = new ContainerModule(bind => {
        bind(WorkspaceUriLabelProviderContribution).toSelf().inSingletonScope();
        bind(IWorkspaceService).to(MockWorkspaceService).inSingletonScope();
        bind(FileSystem).to(MockFilesystem);
    });
    const container = new Container();
    container.load(module);
    labelProvider = container.get(WorkspaceUriLabelProviderContribution);
});

describe('getLongName', function() {
    it('should trim workspace for a file in workspace', function() {
        const file = new URI('file:///workspace/some/very-long/path.js');
        const longName = labelProvider.getLongName(file);
        expect(longName).eq('some/very-long/path.js');
    });

    it('should not trim workspace for a file not in workspace', function() {
        const file = new URI('file:///tmp/prout.txt');
        const longName = labelProvider.getLongName(file);
        expect(longName).eq('/tmp/prout.txt');
    });

    it('should not trim workspace for a file not in workspace 2', function() {
        // Test with a path that is textually a prefix of the workspace,
        // but is not really a child in the filesystem.
        const file = new URI('file:///workspace-2/jacques.doc');
        const longName = labelProvider.getLongName(file);
        expect(longName).eq('/workspace-2/jacques.doc');
    });
});
