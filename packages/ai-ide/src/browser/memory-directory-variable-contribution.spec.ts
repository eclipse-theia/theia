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
import { URI } from '@theia/core';
import { Container } from '@theia/core/shared/inversify';
import { WorkspaceMetadataStorageService, WorkspaceMetadataStore } from '@theia/workspace/lib/browser/metadata-storage';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { MEMORY_DIRECTORY_VARIABLE, MEMORY_METADATA_STORE_KEY, MemoryDirectoryVariableContribution } from './memory-directory-variable-contribution';

describe('MemoryDirectoryVariableContribution', () => {

    let contribution: MemoryDirectoryVariableContribution;
    let location: URI;
    let requestedKeys: string[];
    let ensureExistsCalls: number;
    let workspaceOpen: boolean;

    beforeEach(() => {
        location = new URI('file:///config/workspace-metadata/uuid/memory');
        requestedKeys = [];
        ensureExistsCalls = 0;
        workspaceOpen = true;

        const store = {
            get location(): URI {
                return location;
            },
            ensureExists: async () => {
                ensureExistsCalls++;
            }
        } as unknown as WorkspaceMetadataStore;

        const container = new Container();
        container.bind(WorkspaceMetadataStorageService).toConstantValue({
            getOrCreateStore: async (key: string) => {
                requestedKeys.push(key);
                if (!workspaceOpen) {
                    throw new Error('Cannot create metadata store: no workspace is currently open');
                }
                return store;
            }
        } as WorkspaceMetadataStorageService);
        container.bind(WorkspaceService).toConstantValue({
            tryGetRoots: () => workspaceOpen ? [{ resource: new URI('file:///workspace') }] : []
        } as unknown as WorkspaceService);
        container.bind(MemoryDirectoryVariableContribution).toSelf();

        contribution = container.get(MemoryDirectoryVariableContribution);
    });

    const resolve = (name: string = MEMORY_DIRECTORY_VARIABLE.name) =>
        contribution.resolve({ variable: { ...MEMORY_DIRECTORY_VARIABLE, name } }, {});

    it('resolves the variable to the memory store of the current workspace', async () => {
        const resolved = await resolve();
        expect(resolved?.value).to.equal(location.path.fsPath());
        expect(requestedKeys).to.deep.equal([MEMORY_METADATA_STORE_KEY]);
    });

    it('creates the directory when the variable is resolved, but only once per location', async () => {
        await resolve();
        await resolve();
        expect(ensureExistsCalls).to.equal(1);

        location = new URI('file:///config/workspace-metadata/other/memory');
        await resolve();
        expect(ensureExistsCalls).to.equal(2);
    });

    it('contributes the memory directory as an accessible root', async () => {
        expect((await contribution.getRoots()).map(root => root.toString())).to.deep.equal([location.toString()]);
    });

    it('follows the store location without needing invalidation', async () => {
        await contribution.getRoots();
        location = new URI('file:///config/workspace-metadata/other/memory');
        expect((await contribution.getRoots())[0].toString()).to.equal(location.toString());
    });

    it('does not resolve other variables', async () => {
        expect(await resolve('somethingElse')).to.be.undefined;
    });

    it('has neither a value nor a root without a workspace', async () => {
        workspaceOpen = false;
        expect(await resolve()).to.be.undefined;
        expect(await contribution.getRoots()).to.be.empty;
    });

    it('drops the memory of a closed workspace instead of keeping the cached location', async () => {
        // The store cannot compute a location without a workspace, so on close it keeps the one of the
        // closed workspace. Nothing may be reachable through it any more.
        expect((await resolve())?.value).to.equal(location.path.fsPath());

        workspaceOpen = false;
        expect(await resolve()).to.be.undefined;
        expect(await contribution.getRoots()).to.be.empty;
    });
});
