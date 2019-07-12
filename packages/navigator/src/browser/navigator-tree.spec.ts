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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { Container } from 'inversify';
import { Emitter } from '@theia/core';
import { CompositeTreeNode, LabelProvider, TreeNode } from '@theia/core/lib/browser';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import { FileSystemNode } from '@theia/filesystem/lib/node/node-filesystem';
import { DirNode, FileTree } from '@theia/filesystem/lib/browser';
import { FileNavigatorTree, WorkspaceNode, WorkspaceRootNode } from './navigator-tree';
import { FileNavigatorFilter } from './navigator-filter';
import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import * as sinon from 'sinon';

disableJSDOM();

// tslint:disable:no-any
// tslint:disable:no-unused-expression

let root: CompositeTreeNode;
let workspaceRootFolder: DirNode;
let childA: TreeNode;
let childB: TreeNode;

/**
 * The setup function construct a navigator file tree depicted below:
 *
 * -- root (invisible root node)
 *   |__ workspaceRootFolder
 *      |__ childA
 *      |__ childB
 */
const setup = () => {
    root = <CompositeTreeNode>{ id: 'WorkspaceNodeId', name: 'WorkspaceNode', parent: undefined, children: [] };
    workspaceRootFolder = <DirNode>{
        parent: root,
        uri: new URI('file:///home/rootFolder'),
        selected: false, expanded: true, children: [], id: 'id_rootFolder', name: 'name_rootFolder',
        fileStat: <FileStat>{ uri: 'file:///home/rootFolder', isDirectory: true, lastModification: 0 }
    };
    childA = <TreeNode>{ id: 'idA', name: 'nameA', parent: workspaceRootFolder };
    childB = <TreeNode>{ id: 'idB', name: 'nameB', parent: workspaceRootFolder };
    root.children = [workspaceRootFolder];
    workspaceRootFolder.children = [childA, childB];
};

describe('FileNavigatorTree', () => {
    let testContainer: Container;

    let mockFileNavigatorFilter: FileNavigatorFilter;
    let mockFilesystem: FileSystem;
    let mockLabelProvider: LabelProvider;

    const mockFilterChangeEmitter: Emitter<void> = new Emitter();

    let navigatorTree: FileNavigatorTree;

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        mockFileNavigatorFilter = sinon.createStubInstance(FileNavigatorFilter);
        mockFilesystem = sinon.createStubInstance(FileSystemNode);
        mockLabelProvider = sinon.createStubInstance(LabelProvider);

        testContainer = new Container();
        testContainer.bind(FileNavigatorTree).toSelf().inSingletonScope();
        testContainer.bind(FileNavigatorFilter).toConstantValue(mockFileNavigatorFilter);
        testContainer.bind(FileSystem).toConstantValue(mockFilesystem);
        testContainer.bind(LabelProvider).toConstantValue(mockLabelProvider);

        sinon.stub(mockFileNavigatorFilter, 'onFilterChanged').value(mockFilterChangeEmitter.event);
        setup();

        navigatorTree = testContainer.get<FileNavigatorTree>(FileNavigatorTree);
    });

    it('should refresh the tree on filter gets changed', () => {
        const stubRefresh = sinon.stub(navigatorTree, 'refresh').callsFake(() => { });
        mockFilterChangeEmitter.fire(undefined);
        expect(stubRefresh.called).to.be.true;
    });

    describe('resolveChildren() function', () => {
        it('should return the children of the parent node if it is the root node of workspace', async () => {
            const children = await navigatorTree.resolveChildren(root);
            expect(children.length).to.eq(1);
            expect(children[0]).to.deep.eq(workspaceRootFolder);
        });

        it('should return children filtered by FileNavigatorFilter', async () => {
            const children = Promise.resolve([childA, childB]);
            sinon.stub(FileTree.prototype, 'resolveChildren').returns(children);
            await navigatorTree.resolveChildren(workspaceRootFolder);
            expect((<sinon.SinonStub>mockFileNavigatorFilter.filter).calledWith(children)).to.be.true;
        });
    });

    describe('createId() function', () => {
        it('should return the concatenation of root id + node uri', () => {
            const uri = new URI('file:///home/fileC');
            const ret = navigatorTree.createId(<WorkspaceRootNode>workspaceRootFolder, uri);
            expect(ret).to.eq(`${workspaceRootFolder.id}:${uri.path.toString()}`);
        });
    });
});

describe('WorkspaceNode', () => {
    describe('is() function', () => {
        it('should return true if the node is a CompositeTreeNode with the name of "WorkspaceNode", otherwise false', () => {
            expect(WorkspaceNode.is(undefined)).to.be.false;

            const noNode = <CompositeTreeNode>{ id: 'id', name: 'name', parent: undefined, children: [] };
            expect(WorkspaceNode.is(noNode)).to.be.false;

            // root of the entire navigator file tree
            expect(WorkspaceNode.is(root)).to.be.true;

            // tree node
            expect(WorkspaceNode.is(childA)).to.be.false;
        });
    });

    describe('createRoot() function', () => {
        it('should return a node with the name of "WorkspaceNode" and id of "WorkspaceNodeId"', () => {
            expect(WorkspaceNode.createRoot()).to.deep.eq({
                id: 'WorkspaceNodeId',
                name: 'WorkspaceNode',
                parent: undefined,
                children: [],
                visible: false,
                selected: false
            });
        });
    });
});

describe('WorkspaceRootNode', () => {
    describe('is() function', () => {
        it('should return false if the node is a DirNode with the parent of WorkspaceNode, otherwise false', () => {
            expect(WorkspaceRootNode.is(undefined)).to.be.false;

            expect(WorkspaceRootNode.is(workspaceRootFolder)).to.be.true;

            const noNode = <DirNode>{
                parent: <CompositeTreeNode>{ id: 'parentId', name: 'parentName', parent: undefined, children: [] },
                uri: new URI('file:///home/folderB'),
                selected: false, expanded: true, children: [], id: 'id', name: 'name',
                fileStat: <FileStat>{ uri: 'file:///home/folderB', isDirectory: true, lastModification: 0 }
            };
            expect(WorkspaceRootNode.is(noNode)).to.be.false;

            expect(WorkspaceRootNode.is(childB)).to.be.false;
        });
    });

    describe('find() function', () => {
        it('should return the node itself if the node is a WorkspaceRootNode', () => {
            expect(WorkspaceRootNode.find(workspaceRootFolder)).to.deep.eq(workspaceRootFolder);
        });

        it('should return the ancestor of the node if the node itself is not a WorkspaceRootNode', () => {
            expect(WorkspaceRootNode.find(undefined)).to.be.undefined;

            expect(WorkspaceRootNode.find(childA)).to.deep.eq(workspaceRootFolder);
        });
    });
});
