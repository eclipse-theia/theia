/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

// @ts-check
describe('Navigator', function () {

    const { assert } = chai;

    const { FileService } = require('@theia/filesystem/lib/browser/file-service');
    const { DirNode, FileNode } = require('@theia/filesystem/lib/browser/file-tree/file-tree');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');
    const { FileNavigatorContribution } = require('@theia/navigator/lib/browser/navigator-contribution');

    /** @type {import('inversify').Container} */
    const container = window['theia'].container;
    const fileService = container.get(FileService);
    const workspaceService = container.get(WorkspaceService);
    const navigatorContribution = container.get(FileNavigatorContribution);

    const rootUri = workspaceService.tryGetRoots()[0].resource;
    const fileUri = rootUri.resolve('.test/nested/source/text.txt');
    const targetUri = rootUri.resolve('.test/target');

    beforeEach(async () => {
        await fileService.create(fileUri, 'foo', { fromUserGesture: false, overwrite: true });
        await fileService.createFolder(targetUri);
    });

    afterEach(async () => {
        await fileService.delete(targetUri.parent, { fromUserGesture: false, useTrash: false, recursive: true });
    });

    /** @type {Array<['copy' | 'move', boolean]>} */
    const operations = [
        ['copy', false],
        ['move', false]
    ];
    /** @type {Array<['file' | 'dir', boolean]>} */
    const fileTypes = [
        ['file', false],
        ['dir', false],
    ];
    for (const [operation, onlyOperation] of operations) {
        for (const [fileType, onlyFileType] of fileTypes) {
            const ExpectedNodeType = fileType === 'file' ? FileNode : DirNode;
            (onlyOperation || onlyFileType ? it.only : it)(operation + ' ' + fileType, async function () {
                const navigator = await navigatorContribution.openView({ reveal: true });
                await navigator.model.refresh();

                const sourceUri = fileType === 'file' ? fileUri : fileUri.parent;
                const sourceNode = await navigator.model.revealFile(sourceUri);
                if (!ExpectedNodeType.is(sourceNode)) {
                    return assert.isTrue(ExpectedNodeType.is(sourceNode));
                }

                const targetNode = await navigator.model.revealFile(targetUri);
                if (!DirNode.is(targetNode)) {
                    return assert.isTrue(DirNode.is(targetNode));
                }

                let actualUri;
                if (operation === 'copy') {
                    actualUri = await navigator.model.copy(sourceUri, targetNode);
                } else {
                    actualUri = await navigator.model.move(sourceNode, targetNode);
                }
                if (!actualUri) {
                    return assert.isDefined(actualUri);
                }

                await navigator.model.refresh(targetNode);
                const actualNode = await navigator.model.revealFile(actualUri);
                assert.isTrue(ExpectedNodeType.is(actualNode));
            });
        }
    }

});
