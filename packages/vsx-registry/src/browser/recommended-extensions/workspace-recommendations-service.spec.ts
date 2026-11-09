// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import URI from '@theia/core/lib/common/uri';
import { RecommendedExtensions } from '../../common/recommended-extensions-preference-contribution.js';
import { WorkspaceRecommendationsServiceImpl } from './workspace-recommendations-service.js';

after(() => disableJSDOM());

const FOLDER_A = new URI('file:///workspace/a');
const FOLDER_B = new URI('file:///workspace/b');

interface SetCall {
    preferenceName: string;
    value: string[];
    scope: PreferenceScope;
    resourceUri?: string;
}

interface TestSetup {
    folders: URI[];
    saved?: boolean;
    folderValues?: Record<string, RecommendedExtensions>;
    workspaceValue?: RecommendedExtensions;
    defaultValue?: RecommendedExtensions;
    /** Indices of the picked targets, or `undefined` to simulate a cancelled quick pick. */
    pickedIndices?: number[];
}

function createService(setup: TestSetup): { service: WorkspaceRecommendationsServiceImpl; setCalls: SetCall[]; pickCount: () => number } {
    const setCalls: SetCall[] = [];
    let pickCount = 0;
    const service = new WorkspaceRecommendationsServiceImpl();
    Object.assign(service, {
        workspaceService: {
            opened: setup.folders.length > 0,
            saved: !!setup.saved,
            tryGetRoots: () => setup.folders.map(resource => ({ resource }))
        },
        preferenceService: {
            inspect: (_name: string, resourceUri?: string) => ({
                defaultValue: setup.defaultValue,
                workspaceValue: setup.workspaceValue,
                workspaceFolderValue: resourceUri ? setup.folderValues?.[resourceUri] : undefined
            }),
            set: async (preferenceName: string, value: string[], scope: PreferenceScope, resourceUri?: string) => {
                setCalls.push({ preferenceName, value, scope, resourceUri });
            }
        },
        quickInputService: {
            pick: async (picks: Array<{ type?: string }>) => {
                pickCount++;
                const items = picks.filter(pick => pick.type !== 'separator');
                return setup.pickedIndices?.map(index => items[index]);
            }
        },
        labelProvider: {
            getName: (uri: URI) => uri.path.base
        }
    });
    return { service, setCalls, pickCount: () => pickCount };
}

describe('WorkspaceRecommendationsService', () => {

    describe('isWorkspaceRecommended', () => {

        it('finds a folder recommendation case-insensitively', () => {
            const { service } = createService({
                folders: [FOLDER_A],
                folderValues: { [FOLDER_A.toString()]: { recommendations: ['Publisher.Extension'] } }
            });
            expect(service.isWorkspaceRecommended('publisher.extension')).to.equal(true);
        });

        it('finds a recommendation in a saved workspace file', () => {
            const { service } = createService({
                folders: [FOLDER_A, FOLDER_B],
                saved: true,
                workspaceValue: { recommendations: ['publisher.extension'] }
            });
            expect(service.isWorkspaceRecommended('publisher.extension')).to.equal(true);
        });

        it('ignores recommendations that are only application defaults', () => {
            const { service } = createService({
                folders: [FOLDER_A],
                defaultValue: { recommendations: ['publisher.extension'] }
            });
            expect(service.isWorkspaceRecommended('publisher.extension')).to.equal(false);
        });

        it('returns false if no workspace is opened', () => {
            const { service } = createService({ folders: [] });
            expect(service.canModifyRecommendations()).to.equal(false);
            expect(service.isWorkspaceRecommended('publisher.extension')).to.equal(false);
        });
    });

    describe('addRecommendation', () => {

        it('appends the lower-cased id in a single-folder workspace without asking', async () => {
            const { service, setCalls, pickCount } = createService({
                folders: [FOLDER_A],
                folderValues: { [FOLDER_A.toString()]: { recommendations: ['other.extension'] } }
            });
            await service.addRecommendation('Publisher.Extension');
            expect(pickCount()).to.equal(0);
            expect(setCalls).to.deep.equal([{
                preferenceName: 'extensions.recommendations',
                value: ['other.extension', 'publisher.extension'],
                scope: PreferenceScope.Folder,
                resourceUri: FOLDER_A.toString()
            }]);
        });

        it('removes the id from the unwanted recommendations', async () => {
            const { service, setCalls } = createService({
                folders: [FOLDER_A],
                folderValues: { [FOLDER_A.toString()]: { unwantedRecommendations: ['Publisher.Extension', 'other.extension'] } }
            });
            await service.addRecommendation('publisher.extension');
            expect(setCalls.map(call => [call.preferenceName, call.value])).to.deep.equal([
                ['extensions.recommendations', ['publisher.extension']],
                ['extensions.unwantedRecommendations', ['other.extension']]
            ]);
        });

        it('does not add a duplicate', async () => {
            const { service, setCalls } = createService({
                folders: [FOLDER_A],
                folderValues: { [FOLDER_A.toString()]: { recommendations: ['Publisher.Extension'] } }
            });
            await service.addRecommendation('publisher.extension');
            expect(setCalls).to.deep.equal([]);
        });

        it('writes to the targets picked in a multi-root workspace', async () => {
            const { service, setCalls, pickCount } = createService({
                folders: [FOLDER_A, FOLDER_B],
                saved: true,
                pickedIndices: [1, 2]
            });
            await service.addRecommendation('publisher.extension');
            expect(pickCount()).to.equal(1);
            expect(setCalls.map(call => [call.scope, call.resourceUri])).to.deep.equal([
                [PreferenceScope.Folder, FOLDER_B.toString()],
                [PreferenceScope.Workspace, undefined]
            ]);
        });

        it('writes nothing if the quick pick is cancelled', async () => {
            const { service, setCalls } = createService({
                folders: [FOLDER_A, FOLDER_B],
                saved: true,
                pickedIndices: undefined
            });
            await service.addRecommendation('publisher.extension');
            expect(setCalls).to.deep.equal([]);
        });
    });

    describe('removeRecommendation', () => {

        it('removes the id case-insensitively', async () => {
            const { service, setCalls } = createService({
                folders: [FOLDER_A],
                folderValues: { [FOLDER_A.toString()]: { recommendations: ['Publisher.Extension', 'other.extension'] } }
            });
            await service.removeRecommendation('publisher.extension');
            expect(setCalls).to.deep.equal([{
                preferenceName: 'extensions.recommendations',
                value: ['other.extension'],
                scope: PreferenceScope.Folder,
                resourceUri: FOLDER_A.toString()
            }]);
        });

        it('only offers the targets that recommend the extension', async () => {
            const { service, setCalls, pickCount } = createService({
                folders: [FOLDER_A, FOLDER_B],
                saved: true,
                folderValues: { [FOLDER_B.toString()]: { recommendations: ['publisher.extension'] } }
            });
            await service.removeRecommendation('publisher.extension');
            expect(pickCount()).to.equal(0);
            expect(setCalls.map(call => [call.scope, call.resourceUri, call.value])).to.deep.equal([
                [PreferenceScope.Folder, FOLDER_B.toString(), []]
            ]);
        });
    });
});
