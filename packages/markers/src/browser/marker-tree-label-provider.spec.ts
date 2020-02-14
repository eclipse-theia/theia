/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import URI from '@theia/core/lib/common/uri';
import { expect } from 'chai';
import { Container } from 'inversify';
import { ContributionProvider } from '@theia/core/lib/common';
import { FileStat } from '@theia/filesystem/lib/common';
import { LabelProvider, LabelProviderContribution, DefaultUriLabelProviderContribution } from '@theia/core/lib/browser';
import { MarkerInfoNode } from './marker-tree';
import { MarkerTreeLabelProvider } from './marker-tree-label-provider';
import { TreeLabelProvider } from '@theia/core/lib/browser/tree/tree-label-provider';
import { WorkspaceService } from '@theia/workspace/lib/browser';

disableJSDOM();

let markerTreeLabelProvider: MarkerTreeLabelProvider;
let workspaceService: WorkspaceService;

before(() => {
    disableJSDOM = enableJSDOM();
    const testContainer = new Container();

    workspaceService = new WorkspaceService();
    testContainer.bind(WorkspaceService).toConstantValue(workspaceService);

    testContainer.bind(DefaultUriLabelProviderContribution).toSelf().inSingletonScope();
    testContainer.bind(LabelProvider).toSelf().inSingletonScope();
    testContainer.bind(MarkerTreeLabelProvider).toSelf().inSingletonScope();
    testContainer.bind(TreeLabelProvider).toSelf().inSingletonScope();

    testContainer.bind<ContributionProvider<LabelProviderContribution>>(ContributionProvider).toDynamicValue(ctx => ({
        getContributions(): LabelProviderContribution[] {
            return [
                ctx.container.get<MarkerTreeLabelProvider>(MarkerTreeLabelProvider),
                ctx.container.get<TreeLabelProvider>(TreeLabelProvider),
                ctx.container.get<DefaultUriLabelProviderContribution>(DefaultUriLabelProviderContribution)
            ];
        }
    })).inSingletonScope();

    markerTreeLabelProvider = testContainer.get<MarkerTreeLabelProvider>(MarkerTreeLabelProvider);
    workspaceService = testContainer.get<WorkspaceService>(WorkspaceService);
});

after(() => {
    disableJSDOM();
});

describe('Marker Tree Label Provider', () => {

    it('should return the filename and extension for #getName', () => {
        const label = markerTreeLabelProvider.getName(
            createMarkerInfoNode('a/b/c/foo.ts')
        );
        expect(label).equals('foo.ts');
    });

    it('should return the folder name for #getLongName', async () => {

        // Verify that the label provider successfully returns the directory name.
        let label = markerTreeLabelProvider.getLongName(
            createMarkerInfoNode('a/b/c/foo.ts')
        );
        expect(label).equals('/a/b/c');

        // Verify that the label provider successfully returns the directory name (starting with a period).
        label = markerTreeLabelProvider.getLongName(
            createMarkerInfoNode('a/b/.c/foo.ts')
        );
        expect(label).equals('/a/b/.c');

        // Verify that the label provider successfully returns the directory name (at the root).
        label = markerTreeLabelProvider.getLongName(
            createMarkerInfoNode('foo.ts')
        );
        expect(label).equals('/');

        // Verify that the label provider successfully returns the directory and root name for a multiple root workspace.
        const uri: string = 'file:///file';
        const file = <FileStat>{
            uri: uri,
            lastModification: 0,
            isDirectory: false
        };
        const root1 = <FileStat>{
            uri: 'file:///root1',
            lastModification: 0,
            isDirectory: true
        };
        const root2 = <FileStat>{
            uri: 'file:///root2',
            lastModification: 0,
            isDirectory: true
        };
        workspaceService['_workspace'] = file;
        workspaceService['_roots'] = [root1, root2];
        label = markerTreeLabelProvider.getLongName(
            createMarkerInfoNode('file:///root1/foo/foo.ts')
        );
        expect(label).equals('root1 ● /root1/foo');

        label = markerTreeLabelProvider.getLongName(
            createMarkerInfoNode('file:///root2/foo/foo.ts')
        );
        expect(label).equals('root2 ● /root2/foo');
    });

    it('should return the filename and extension for #getIcon', () => {

        // Verify that a typescript icon is returned for a typescript file.
        const typescriptIcon = markerTreeLabelProvider.getIcon(
            createMarkerInfoNode('a/b/c/foo.ts')
        );
        expect(typescriptIcon).contain('ts-icon');

        // Verify that a json icon is returned for a json file.
        const jsonIcon = markerTreeLabelProvider.getIcon(
            createMarkerInfoNode('a/b/c/foo.json')
        );
        expect(jsonIcon).contain('database-icon');

        // Verify that a markdown icon is returned for a markdown file.
        const markdownIcon = markerTreeLabelProvider.getIcon(
            createMarkerInfoNode('a/b/c/foo.md')
        );
        expect(markdownIcon).contain('markdown-icon');
    });

    it('should return the parent\'s long name for #getDescription', () => {

        let label = markerTreeLabelProvider.getDescription(
            createMarkerInfoNode('a/b/c/foo.ts')
        );
        expect(label).equals('/a/b/c');

        label = markerTreeLabelProvider.getDescription(
            createMarkerInfoNode('foo.ts')
        );
        expect(label).equals('/');
    });

    it('should successfully handle \'MarkerInfoNodes\'', () => {
        const node = createMarkerInfoNode('a/b/c/foo.ts');
        expect(markerTreeLabelProvider.canHandle(node)).greaterThan(0);
    });
});

/**
 * Create a marker info node for test purposes.
 * @param uri the marker uri.
 *
 * @returns a mock marker info node.
 */
function createMarkerInfoNode(uri: string): MarkerInfoNode {
    return {
        id: 'id',
        parent: {
            id: 'parent-id',
            kind: '',
            parent: undefined,
            children: []
        },
        numberOfMarkers: 1,
        children: [],
        expanded: true,
        selected: true,
        uri: new URI(uri)
    };
}
