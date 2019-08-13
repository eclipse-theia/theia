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
import { Emitter, ILogger, Logger } from '@theia/core';
import {
    CompositeTreeNode, DefaultOpenerService, ExpandableTreeNode, LabelProvider, OpenerService,
    Tree, TreeNode, TreeSelectionService, TreeExpansionService, TreeExpansionServiceImpl,
    TreeNavigationService, TreeSearch, CorePreferences
} from '@theia/core/lib/browser';
import { TreeSelectionServiceImpl } from '@theia/core/lib/browser/tree/tree-selection-impl';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import { FileSystemWatcher } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { FileSystemNode } from '@theia/filesystem/lib/node/node-filesystem';
import { DirNode, FileChange, FileMoveEvent, FileTreeModel, FileStatNode } from '@theia/filesystem/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileNavigatorTree, WorkspaceNode, WorkspaceRootNode } from './navigator-tree';
import { FileNavigatorModel } from './navigator-model';
import { createMockPreferenceProxy } from '@theia/core/lib/browser/preferences/test';
import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import * as sinon from 'sinon';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';

disableJSDOM();

// tslint:disable:no-any
// tslint:disable:no-unused-expression

let root: CompositeTreeNode;
let workspaceRootFolder: DirNode;

let childA: FileStatNode;
let childB: FileStatNode;

let homeFolder: DirNode;
let childC: FileStatNode;

let folderA: FileStat;
let folderB: FileStat;

/**
 * The setup function construct a navigator file tree depicted below:
 *
 * -- root (invisible root node)
 *   |__ workspaceRootFolder
 *      |__ childA
 *      |__ childB
 *
 * The following nodes are not in the navigator file tree:
 *
 * -- homeFolder
 *   |__ childC
 *   |__ folderA
 *   |__ folderB
 */
const setup = () => {
    root = <CompositeTreeNode>{ id: 'WorkspaceNodeId', name: 'WorkspaceNode', parent: undefined, children: [] };
    workspaceRootFolder = <DirNode>{
        parent: root,
        uri: new URI('file:///home/rootFolder'),
        selected: false, expanded: true, children: [], id: 'id_rootFolder', name: 'name_rootFolder',
        fileStat: <FileStat>{ uri: 'file:///home/rootFolder', isDirectory: true, lastModification: 0 }
    };
    childA = <FileStatNode>{
        id: 'idA', name: 'nameA', parent: workspaceRootFolder, uri: new URI('file:///home/rootFolder/childA'), selected: false,
        fileStat: <FileStat>{ uri: 'file:///home/rootFolder/childA', isDirectory: true, lastModification: 0 }
    };
    childB = <FileStatNode>{
        id: 'idB', name: 'nameB', parent: workspaceRootFolder, uri: new URI('file:///home/rootFolder/childB'), selected: false,
        fileStat: <FileStat>{ uri: 'file:///home/rootFolder/childB', isDirectory: true, lastModification: 0 }
    };
    root.children = [workspaceRootFolder];
    workspaceRootFolder.children = [childA, childB];

    homeFolder = {
        parent: root,
        uri: new URI('file:///home'),
        selected: false, expanded: true, children: [], id: 'id_rootFolder', name: 'name_rootFolder',
        fileStat: <FileStat>{ uri: 'file:///home/rootFolder', isDirectory: true, lastModification: 0 }
    };
    childC = {
        id: 'idC', name: 'nameC', parent: homeFolder, uri: new URI('file:///home/childC'), selected: false,
        fileStat: <FileStat>{ uri: 'file:///home/childC', isDirectory: false, lastModification: 0 }
    };
    homeFolder.children = [childC];

    folderA = Object.freeze(<FileStat>{
        uri: 'file:///home/folderA',
        lastModification: 0,
        isDirectory: true
    });
    folderB = Object.freeze(<FileStat>{
        uri: 'file:///home/folderB',
        lastModification: 0,
        isDirectory: true
    });
};

describe('FileNavigatorModel', () => {
    let testContainer: Container;

    let mockOpenerService: OpenerService;
    let mockFileNavigatorTree: FileNavigatorTree;
    let mockWorkspaceService: WorkspaceService;
    let mockFilesystem: FileSystem;
    let mockLabelProvider: LabelProvider;
    let mockFileSystemWatcher: FileSystemWatcher;
    let mockILogger: ILogger;
    let mockTreeSelectionService: TreeSelectionService;
    let mockTreeExpansionService: TreeExpansionService;
    let mockTreeNavigationService: TreeNavigationService;
    let mockTreeSearch: TreeSearch;
    let mockPreferences: CorePreferences;

    const mockWorkspaceServiceEmitter: Emitter<FileStat[]> = new Emitter();
    const mockWorkspaceOnLocationChangeEmitter: Emitter<FileStat | undefined> = new Emitter();
    const mockFileChangeEmitter: Emitter<FileChange[]> = new Emitter();
    const mockFileMoveEmitter: Emitter<FileMoveEvent> = new Emitter();
    const mockTreeChangeEmitter: Emitter<void> = new Emitter();
    const mockExpansionChangeEmitter: Emitter<Readonly<ExpandableTreeNode>> = new Emitter();

    let navigatorModel: FileNavigatorModel;
    const toRestore: Array<sinon.SinonStub | sinon.SinonSpy | sinon.SinonMock> = [];

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        mockOpenerService = sinon.createStubInstance(DefaultOpenerService);
        mockFileNavigatorTree = sinon.createStubInstance(FileNavigatorTree);
        mockWorkspaceService = sinon.createStubInstance(WorkspaceService);
        mockFilesystem = sinon.createStubInstance(FileSystemNode);
        mockLabelProvider = sinon.createStubInstance(LabelProvider);
        mockFileSystemWatcher = sinon.createStubInstance(FileSystemWatcher);
        mockILogger = sinon.createStubInstance(Logger);
        mockTreeSelectionService = sinon.createStubInstance(TreeSelectionServiceImpl);
        mockTreeExpansionService = sinon.createStubInstance(TreeExpansionServiceImpl);
        mockTreeNavigationService = sinon.createStubInstance(TreeNavigationService);
        mockTreeSearch = sinon.createStubInstance(TreeSearch);
        mockPreferences = createMockPreferenceProxy({});
        const mockApplicationStateService = sinon.createStubInstance(FrontendApplicationStateService);

        testContainer = new Container();
        testContainer.bind(FileNavigatorModel).toSelf().inSingletonScope();
        testContainer.bind(OpenerService).toConstantValue(mockOpenerService);
        testContainer.bind(FileNavigatorTree).toConstantValue(mockFileNavigatorTree);
        testContainer.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
        testContainer.bind(FileSystem).toConstantValue(mockFilesystem);
        testContainer.bind(LabelProvider).toConstantValue(mockLabelProvider);
        testContainer.bind(FileSystemWatcher).toConstantValue(mockFileSystemWatcher);
        testContainer.bind(ILogger).toConstantValue(mockILogger);
        testContainer.bind(Tree).toConstantValue(mockFileNavigatorTree);
        testContainer.bind(TreeSelectionService).toConstantValue(mockTreeSelectionService);
        testContainer.bind(TreeExpansionService).toConstantValue(mockTreeExpansionService);
        testContainer.bind(TreeNavigationService).toConstantValue(mockTreeNavigationService);
        testContainer.bind(TreeSearch).toConstantValue(mockTreeSearch);
        testContainer.bind(CorePreferences).toConstantValue(mockPreferences);
        testContainer.bind(FrontendApplicationStateService).toConstantValue(mockApplicationStateService);

        sinon.stub(mockWorkspaceService, 'onWorkspaceChanged').value(mockWorkspaceServiceEmitter.event);
        sinon.stub(mockWorkspaceService, 'onWorkspaceLocationChanged').value(mockWorkspaceOnLocationChangeEmitter.event);
        (mockFileSystemWatcher['onFilesChanged'] as any) = mockFileChangeEmitter.event;
        (mockFileSystemWatcher['onDidMove'] as any) = mockFileMoveEmitter.event;
        sinon.stub(mockFileNavigatorTree, 'onChanged').value(mockTreeChangeEmitter.event);
        sinon.stub(mockTreeExpansionService, 'onExpansionChanged').value(mockExpansionChangeEmitter.event);

        setup();
        navigatorModel = testContainer.get<FileNavigatorModel>(FileNavigatorModel);
    });
    afterEach(() => {
        toRestore.forEach(res => {
            res.restore();
        });
        toRestore.length = 0;
    });

    it('should update the root(s) on receiving a WorkspaceChanged event from the WorkspaceService', done => {
        sinon.stub(navigatorModel, 'updateRoot').callsFake(() => {
            done(); // This test would time out if updateRoot() is not called
        });
        mockWorkspaceServiceEmitter.fire([]);
    }).timeout(2000);

    describe('updateRoot() function', () => {
        it('should assign "this.root" a WorkspaceNode with WorkspaceRootNodes (one for each root folder in the workspace) as its children', async () => {
            sinon.stub(mockWorkspaceService, 'roots').value([folderA, folderB]);
            sinon.stub(mockWorkspaceService, 'opened').value(true);
            (<sinon.SinonStub>mockFileNavigatorTree.createWorkspaceRoot).callsFake((stat, rootNode) =>
                Promise.resolve(<DirNode>{
                    parent: rootNode,
                    uri: new URI(stat.uri),
                    selected: false, expanded: true, children: [], id: 'id_rootFolder', name: 'name_rootFolder',
                    fileStat: <FileStat>{ uri: stat.uri, isDirectory: true, lastModification: 0 }
                })
            );

            await navigatorModel.updateRoot();
            const thisRoot = navigatorModel['root'] as WorkspaceNode;
            expect(thisRoot).not.to.be.undefined;
            expect(thisRoot.children.length).to.eq(2);
            expect(thisRoot.children[0].uri.toString()).to.eq(folderA.uri);
            expect(thisRoot.children[1].uri.toString()).to.eq(folderB.uri);
        });

        it('should assign "this.root" undefined if there is no workspace open', async () => {
            sinon.stub(mockWorkspaceService, 'opened').value(false);

            await navigatorModel.updateRoot();
            const thisRoot = navigatorModel['root'] as WorkspaceNode;
            expect(thisRoot).to.be.undefined;
        });
    });

    describe('move() function', () => {
        it('should do nothing if user tries to move a root folder', () => {
            const stubMove = sinon.stub(FileTreeModel.prototype, 'move').callsFake(() => { });
            const stubCheckRoot = sinon.stub(WorkspaceRootNode, 'is').returns(true);
            toRestore.push(...[stubMove, stubCheckRoot]);

            navigatorModel.move(workspaceRootFolder, childA);
            expect(stubMove.called).to.be.false;
        });

        it('should pass argument to move() in FileTreeModel class if the node being moved is not a root folder', () => {
            const stubMove = sinon.stub(FileTreeModel.prototype, 'move').callsFake(() => { });
            const stubCheckRoot = sinon.stub(WorkspaceRootNode, 'is').returns(false);
            toRestore.push(...[stubMove, stubCheckRoot]);

            navigatorModel.move(childA, workspaceRootFolder);
            expect(stubMove.called).to.be.true;
        });
    });

    describe('revealFile() function', () => {
        it('should return undefined if the uri to be revealed does not contain an absolute path', async () => {
            const ret = await navigatorModel.revealFile(new URI('folderC/untitled'));
            expect(ret).to.be.undefined;
        });

        it('should return undefined if node being revealed is not part of the file tree', async () => {
            navigatorModel['root'] = root;
            (<sinon.SinonStub>mockFileNavigatorTree.createId).callsFake((rootNode, uri) => `${rootNode ? rootNode.id : 'no_root_node'}:${uri.path.toString()}`);
            sinon.stub(navigatorModel, 'getNode').callsFake((id: string | undefined): TreeNode | undefined => {
                if (id) {
                    if (id.endsWith(childA.uri.path.toString())) {
                        return childA;
                    } else if (id.endsWith(childB.uri.path.toString())) {
                        return childB;
                    } else if (id.endsWith(workspaceRootFolder.uri.path.toString())) {
                        return workspaceRootFolder;
                    } else if (id.endsWith(childC.uri.path.toString())) {
                        return childC;
                    }
                }
                return undefined;
            });
            const ret = await navigatorModel.revealFile(childC.uri); // childC is not under any root folder of the workspace
            expect(ret).to.be.undefined;
        });

        const fakeCreateId = (rootNode: WorkspaceRootNode, uri: URI) => `${rootNode ? rootNode.id : 'no_root_node'}:${uri.path.toString()}`;
        const fakeGetNode = (id: string | undefined): TreeNode | undefined => {
            if (id) {
                if (id.endsWith(childA.uri.path.toString())) {
                    return childA;
                } else if (id.endsWith(childB.uri.path.toString())) {
                    return childB;
                } else if (id.endsWith(workspaceRootFolder.uri.path.toString())) {
                    return workspaceRootFolder;
                } else if (id.endsWith(childC.uri.path.toString())) {
                    return childC;
                }
            }
            return undefined;
        };

        it('should return undefined if cannot find a node from the file tree', async () => {
            navigatorModel['root'] = root;
            (<sinon.SinonStub>mockFileNavigatorTree.createId).callsFake(fakeCreateId);
            sinon.stub(navigatorModel, 'getNode').callsFake(fakeGetNode);

            const ret = await navigatorModel.revealFile(childC.uri);
            expect(ret).to.be.undefined;
        });

        it('should return the node if the node being revealed is part of the file tree', async () => {
            navigatorModel['root'] = root;
            (<sinon.SinonStub>mockFileNavigatorTree.createId).callsFake(fakeCreateId);
            sinon.stub(navigatorModel, 'getNode').callsFake(fakeGetNode);

            const ret = await navigatorModel.revealFile(childB.uri);
            expect(ret).not.to.be.undefined;
            expect(ret && ret.id).to.eq(childB.id);
        });

        it('should return the node and expand the node if the node being revealed is a folder as part of the file tree', async () => {
            navigatorModel['root'] = root;
            (<sinon.SinonStub>mockFileNavigatorTree.createId).callsFake(fakeCreateId);
            const stubExpand = sinon.stub(navigatorModel, <any>'expandNode');
            stubExpand.callsFake(() => { });
            sinon.stub(navigatorModel, 'getNode').callsFake(fakeGetNode);

            await navigatorModel.revealFile(Object.assign(childB, { expanded: false, children: [] }).uri);
            expect(stubExpand.called).to.be.true;
        });
    });
});
