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
import { WorkspaceService } from './workspace-service';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { FileSystemNode } from '@theia/filesystem/lib/node/node-filesystem';
import { FileSystemWatcher, FileChangeEvent, FileChangeType } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { DefaultWindowService, WindowService } from '@theia/core/lib/browser/window/window-service';
import { WorkspaceServer } from '../common';
import { DefaultWorkspaceServer } from '../node/default-workspace-server';
import { Emitter, Disposable, DisposableCollection, ILogger, Logger } from '@theia/core';
import { WorkspacePreferences } from './workspace-preferences';
import { createMockPreferenceProxy } from '@theia/core/lib/browser/preferences/test';
import * as sinon from 'sinon';
import * as chai from 'chai';
import URI from '@theia/core/lib/common/uri';
const expect = chai.expect;

disableJSDOM();

const folderA = Object.freeze(<FileStat>{
    uri: 'file:///home/folderA',
    lastModification: 0,
    isDirectory: true
});
const folderB = Object.freeze(<FileStat>{
    uri: 'file:///home/folderB',
    lastModification: 0,
    isDirectory: true
});

// tslint:disable:no-any
// tslint:disable:no-unused-expression
describe('WorkspaceService', () => {
    const toRestore: Array<sinon.SinonStub | sinon.SinonSpy | sinon.SinonMock> = [];
    const toDispose: Disposable[] = [];
    let wsService: WorkspaceService;
    let updateTitleStub: sinon.SinonStub;
    // stub of window.location.reload
    let windowLocationReloadStub: sinon.SinonStub;
    let onFilesChangedStub: sinon.SinonStub;

    let mockFileChangeEmitter: Emitter<FileChangeEvent>;
    let mockPreferenceValues: { [p: string]: any };
    let mockFilesystem: FileSystem;
    let mockFileSystemWatcher: FileSystemWatcher;
    let mockWorkspaceServer: WorkspaceServer;
    let mockWindowService: WindowService;
    let mockILogger: ILogger;
    let mockPref: WorkspacePreferences;

    before(() => {
        disableJSDOM = enableJSDOM();
        FrontendApplicationConfigProvider.set({
            'applicationName': 'test',
        });
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        mockPreferenceValues = {};
        mockFilesystem = sinon.createStubInstance(FileSystemNode);
        mockFileSystemWatcher = sinon.createStubInstance(FileSystemWatcher);
        mockWorkspaceServer = sinon.createStubInstance(DefaultWorkspaceServer);
        mockWindowService = sinon.createStubInstance(DefaultWindowService);
        mockILogger = sinon.createStubInstance(Logger);
        mockPref = createMockPreferenceProxy(mockPreferenceValues);

        const testContainer = new Container();
        testContainer.bind(WorkspaceService).toSelf().inSingletonScope();
        testContainer.bind(FileSystem).toConstantValue(mockFilesystem);
        testContainer.bind(FileSystemWatcher).toConstantValue(mockFileSystemWatcher);
        testContainer.bind(WorkspaceServer).toConstantValue(mockWorkspaceServer);
        testContainer.bind(WindowService).toConstantValue(mockWindowService);
        testContainer.bind(ILogger).toConstantValue(mockILogger);
        testContainer.bind(WorkspacePreferences).toConstantValue(mockPref);

        // stub the updateTitle() & reloadWindow() function because `document` and `window` are unavailable
        updateTitleStub = sinon.stub(WorkspaceService.prototype, <any>'updateTitle').callsFake(() => { });
        windowLocationReloadStub = sinon.stub(window.location, 'reload');
        mockFileChangeEmitter = new Emitter();
        onFilesChangedStub = sinon.stub(mockFileSystemWatcher, 'onFilesChanged').value(mockFileChangeEmitter.event);
        toDispose.push(mockFileChangeEmitter);
        toRestore.push(...[updateTitleStub, windowLocationReloadStub, onFilesChangedStub]);

        wsService = testContainer.get<WorkspaceService>(WorkspaceService);
    });

    afterEach(() => {
        wsService['toDisposeOnWorkspace'].dispose();
        toRestore.forEach(res => {
            res.restore();
        });
        toRestore.length = 0;
        toDispose.forEach(dis => dis.dispose());
        toDispose.length = 0;
    });

    describe('constructor and init', () => {
        it('should reset the exposed roots and title if the most recently used workspace is unavailable', async () => {
            (<sinon.SinonStub>mockWorkspaceServer.getMostRecentlyUsedWorkspace).resolves(undefined);

            await wsService['init']();
            expect(wsService.workspace).to.to.be.undefined;
            expect((await wsService.roots).length).to.eq(0);
            expect(wsService.tryGetRoots().length).to.eq(0);
            expect(updateTitleStub.called).to.be.true;
            expect(window.location.hash).to.be.empty;
        });

        it('should reset the exposed roots and title if server returns an invalid or nonexistent file / folder', async () => {
            const invalidStat = <FileStat>{
                uri: 'file:///home/invalid',
                lastModification: 0,
                isDirectory: true
            };
            (<sinon.SinonStub>mockWorkspaceServer.getMostRecentlyUsedWorkspace).resolves(invalidStat.uri);
            (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(undefined);
            (<sinon.SinonStub>mockFileSystemWatcher.watchFileChanges).resolves(new DisposableCollection());

            await wsService['init']();
            expect(wsService.workspace).to.to.be.undefined;
            expect((await wsService.roots).length).to.eq(0);
            expect(wsService.tryGetRoots().length).to.eq(0);
            expect(updateTitleStub.called).to.be.true;
            expect(window.location.hash).to.be.empty;
        });

        ['/home/oneFolder', '/home/oneFolder/'].forEach(uriStr => {
            it('should set the exposed roots and workspace to the folder returned by server as the most recently used workspace, and start watching that folder', async () => {
                const stat = <FileStat>{
                    uri: 'file://' + uriStr,
                    lastModification: 0,
                    isDirectory: true
                };
                (<sinon.SinonStub>mockWorkspaceServer.getMostRecentlyUsedWorkspace).resolves(stat.uri);
                (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(stat);
                (<sinon.SinonStub>mockFileSystemWatcher.watchFileChanges).resolves(new DisposableCollection());

                await wsService['init']();
                expect(wsService.workspace).to.eq(stat);
                expect((await wsService.roots).length).to.eq(1);
                expect(wsService.tryGetRoots().length).to.eq(1);
                expect(wsService.tryGetRoots()[0]).to.eq(stat);
                expect((<sinon.SinonStub>mockFileSystemWatcher.watchFileChanges).calledWith(new URI(stat.uri))).to.be.true;
                expect(window.location.hash).eq('#' + uriStr);
            });
        });

        it('should set the exposed roots and workspace to the folders listed in the workspace file returned by the server, ' +
            'and start watching the workspace file and all the folders', async () => {
                const workspaceFilePath = '/home/workspaceFile';
                const workspaceFileUri = 'file://' + workspaceFilePath;
                const workspaceFileStat = <FileStat>{
                    uri: workspaceFileUri,
                    lastModification: 0,
                    isDirectory: false
                };
                const rootA = 'file:///folderA';
                const rootB = 'file:///folderB';
                (<sinon.SinonStub>mockWorkspaceServer.getMostRecentlyUsedWorkspace).resolves(workspaceFileStat.uri);
                const stubGetFileStat = (<sinon.SinonStub>mockFilesystem.getFileStat);
                stubGetFileStat.withArgs(workspaceFileUri).resolves(workspaceFileStat);
                (<sinon.SinonStub>mockFilesystem.exists).resolves(true);
                (<sinon.SinonStub>mockFilesystem.resolveContent).resolves({
                    stat: workspaceFileStat,
                    content: `{"folders":[{"path":"${rootA}"},{"path":"${rootB}"}],"settings":{}}`
                });
                stubGetFileStat.withArgs(rootA).resolves(<FileStat>{
                    uri: rootA, lastModification: 0, isDirectory: true
                }); // rootA exists
                stubGetFileStat.withArgs(rootB).throws(new Error()); // no access to rootB
                (<sinon.SinonStub>mockFileSystemWatcher.watchFileChanges).resolves(new DisposableCollection());

                await wsService['init']();
                expect(wsService.workspace).to.eq(workspaceFileStat);
                expect((await wsService.roots).length).to.eq(2);
                expect(wsService.tryGetRoots().length).to.eq(2);
                expect(wsService.tryGetRoots()[0].uri).to.eq(rootA);
                expect(wsService.tryGetRoots()[1].uri).to.eq(rootB);
                expect(window.location.hash).to.eq('#' + workspaceFilePath);

                expect((<Map<string, Disposable>>wsService['rootWatchers']).size).to.eq(2);
                expect((<Map<string, Disposable>>wsService['rootWatchers']).has(rootA)).to.be.true;
                expect((<Map<string, Disposable>>wsService['rootWatchers']).has(rootB)).to.be.true;
            });

        it('should set the exposed roots an empty array if the workspace file stores invalid workspace data', async () => {
            const workspaceFileUri = 'file:///home/workspaceFile';
            const workspaceFileStat = <FileStat>{
                uri: workspaceFileUri,
                lastModification: 0,
                isDirectory: false
            };
            (<sinon.SinonStub>mockWorkspaceServer.getMostRecentlyUsedWorkspace).resolves(workspaceFileStat.uri);
            (<sinon.SinonStub>mockFilesystem.getFileStat).withArgs(workspaceFileUri).resolves(workspaceFileStat);
            (<sinon.SinonStub>mockFilesystem.exists).resolves(true);
            (<sinon.SinonStub>mockFilesystem.resolveContent).resolves({
                stat: workspaceFileStat,
                content: 'invalid workspace data'
            });
            (<sinon.SinonStub>mockFileSystemWatcher.watchFileChanges).resolves(new DisposableCollection());

            await wsService['init']();
            expect(wsService.workspace && wsService.workspace.uri).to.eq(workspaceFileStat.uri);
            expect((await wsService.roots).length).to.eq(0);
            expect(wsService.tryGetRoots().length).to.eq(0);
            expect((<sinon.SinonStub>mockILogger.error).called).to.be.true;
        });

        it('should use the workspace path in the URL fragment, if available', async function() {
            const workspacePath = '/home/somewhere';
            window.location.hash = '#' + workspacePath;
            const stat = <FileStat>{
                uri: 'file://' + workspacePath,
                lastModification: 0,
                isDirectory: true
            };
            (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(stat);
            (<sinon.SinonStub>mockFileSystemWatcher.watchFileChanges).resolves(new DisposableCollection());

            await wsService['init']();
            expect(wsService.workspace).to.eq(stat);
            expect((await wsService.roots).length).to.eq(1);
            expect(wsService.tryGetRoots().length).to.eq(1);
            expect(wsService.tryGetRoots()[0]).to.eq(stat);
            expect((<sinon.SinonStub>mockFileSystemWatcher.watchFileChanges).calledWith(new URI(stat.uri))).to.be.true;
            expect(window.location.hash).to.eq('#' + workspacePath);
        });
    });

    describe('onStop() function', () => {
        it('should send server an empty string if there is no workspace', () => {
            wsService['_workspace'] = undefined;
            wsService.onStop();
            expect((<sinon.SinonStub>mockWorkspaceServer.setMostRecentlyUsedWorkspace).calledWith('')).to.be.true;
        });

        it('should send server the uri of current workspace if there is workspace opened', () => {
            const uri = 'file:///home/testUri';
            wsService['_workspace'] = <FileStat>{
                uri,
                lastModification: 0,
                isDirectory: false
            };
            wsService.onStop();
            expect((<sinon.SinonStub>mockWorkspaceServer.setMostRecentlyUsedWorkspace).calledWith(uri)).to.be.true;
        });
    });

    describe('recentWorkspaces() function', () => {
        it('should get the recent workspaces from the server', () => {
            wsService.recentWorkspaces();
            expect((<sinon.SinonStub>mockWorkspaceServer.getRecentWorkspaces).called).to.be.true;
        });
    });

    describe('open() function', () => {
        it('should call doOpen() with exactly the same arguments', () => {
            const uri = new URI('file:///home/testUri');
            toRestore.push(sinon.stub(WorkspaceService.prototype, <any>'doOpen').callsFake(() => { }));
            wsService.open(uri, {});
            expect((<sinon.SinonStub>wsService['doOpen']).calledWith(uri, {})).to.be.true;
        });

        it('should throw an error if the uri passed in is invalid or nonexistent', done => {
            (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(undefined);
            wsService['doOpen'](new URI('file:///home/testUri'))
                .then(() => {
                    done(new Error('WorkspaceService.doOpen() should throw an error but did not'));
                }).catch(e => {
                    expect(window.location.hash).to.be.empty;
                    done();
                });
        });

        it('should reload the current window with new uri if preferences["workspace.preserveWindow"] = true and there is an opened current workspace', async () => {
            mockPreferenceValues['workspace.preserveWindow'] = true;
            const newPath = '/home/newWorkspaceUri';
            const newUriStr = 'file://' + newPath;
            const newUri = new URI(newUriStr);
            const stat = <FileStat>{
                uri: newUriStr,
                lastModification: 0,
                isDirectory: true
            };
            (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(stat);
            toRestore.push(sinon.stub(wsService, 'roots').resolves([stat]));
            (wsService['_workspace'] as any) = stat;

            await wsService['doOpen'](newUri, {});
            expect(windowLocationReloadStub.called).to.be.true;
            expect((<sinon.SinonStub>mockWorkspaceServer.setMostRecentlyUsedWorkspace).calledWith(newUriStr)).to.be.true;
            expect(wsService.workspace).to.eq(stat);
            expect(window.location.hash).to.eq('#' + newPath);
        });

        it('should keep the old Theia window & open a new window if preferences["workspace.preserveWindow"] = false and there is an opened current workspace', async () => {
            mockPreferenceValues['workspace.preserveWindow'] = false;
            const oldWorkspacePath = '/home/oldWorkspaceUri';
            const oldWorkspaceUriStr = 'file:///home/oldWorkspaceUri';
            const oldStat = <FileStat>{
                uri: oldWorkspaceUriStr,
                lastModification: 0,
                isDirectory: true
            };
            toRestore.push(sinon.stub(wsService, 'roots').resolves([oldStat]));
            (wsService['_workspace'] as any) = oldStat;
            window.location.hash = '#' + oldWorkspacePath;
            const newWorkspaceUriStr = 'file:///home/newWorkspaceUri';
            const uri = new URI(newWorkspaceUriStr);
            const newStat = <FileStat>{
                uri: newWorkspaceUriStr,
                lastModification: 0,
                isDirectory: true
            };
            (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(newStat);
            const stubOpenNewWindow = sinon.stub(wsService, <any>'openNewWindow').callsFake(() => { });
            toRestore.push(stubOpenNewWindow);

            await wsService['doOpen'](uri, {});
            expect(windowLocationReloadStub.called).to.be.false;
            expect((<sinon.SinonStub>mockWorkspaceServer.setMostRecentlyUsedWorkspace).calledWith(newWorkspaceUriStr)).to.be.true;
            expect(stubOpenNewWindow.called).to.be.true;
            expect(wsService.workspace).to.eq(oldStat);
            expect(window.location.hash).to.eq('#' + oldWorkspacePath);
        });

        it('should reload the current window with new uri if preferences["workspace.preserveWindow"] = false and browser blocks the new window being opened', async () => {
            mockPreferenceValues['workspace.preserveWindow'] = false;
            const oldWorkspacePath = '/home/oldWorkspaceUri';
            const oldWorkspaceUriStr = 'file://' + oldWorkspacePath;
            const oldStat = <FileStat>{
                uri: oldWorkspaceUriStr,
                lastModification: 0,
                isDirectory: true
            };
            toRestore.push(sinon.stub(wsService, 'roots').resolves([oldStat]));
            (wsService['_workspace'] as any) = oldStat;
            window.location.hash = '#' + oldWorkspacePath;
            const newWorkspacePath = '/home/newWorkspaceUri';
            const newWorkspaceUriStr = 'file://' + newWorkspacePath;
            const uri = new URI(newWorkspaceUriStr);
            const newStat = <FileStat>{
                uri: newWorkspaceUriStr,
                lastModification: 0,
                isDirectory: true
            };
            (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(newStat);
            (<sinon.SinonStub>mockILogger.error).resolves(undefined);
            const stubOpenNewWindow = sinon.stub(wsService, <any>'openNewWindow').throws();
            toRestore.push(stubOpenNewWindow);

            await wsService['doOpen'](uri, {});
            expect(windowLocationReloadStub.called).to.be.true;
            expect((<sinon.SinonStub>mockWorkspaceServer.setMostRecentlyUsedWorkspace).calledWith(newWorkspaceUriStr)).to.be.true;
            expect(stubOpenNewWindow.called).to.be.true;
            expect(wsService.workspace).to.eq(newStat);
            expect(window.location.hash).to.eq('#' + newWorkspacePath);
        });
    });

    describe('close() function', () => {
        it('should reset the exposed roots and workspace, and set the most recently used workspace empty through the server', async () => {
            const stat = <FileStat>{
                uri: 'file:///home/folder',
                lastModification: 0,
                isDirectory: true
            };
            wsService['_workspace'] = stat;
            wsService['_roots'] = [stat];
            window.location.hash = '#something';

            await wsService.close();
            expect(wsService.workspace).to.be.undefined;
            expect((await wsService.roots).length).to.eq(0);
            expect((<sinon.SinonStub>mockWorkspaceServer.setMostRecentlyUsedWorkspace).calledWith('')).to.be.true;
            expect(window.location.hash).to.be.empty;
        });
    });

    describe('addRoot() function', () => {
        it('should throw an error if there is no opened workspace', done => {
            wsService['_workspace'] = undefined;

            wsService.addRoot(new URI())
                .then(() => {
                    done(new Error('WorkspaceService.addRoot() should throw an error but did not.'));
                }).catch(e => {
                    done();
                });
        });

        it('should throw an error if the added uri is invalid or nonexistent', done => {
            (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(undefined);
            toRestore.push(sinon.stub(wsService, 'opened').value(true));
            wsService.addRoot(new URI())
                .then(() => {
                    done(new Error('WorkspaceService.addRoot() should throw an error but did not.'));
                }).catch(e => {
                    done();
                });
        });

        it('should throw an error if the added uri points to a file instead of a folder', done => {
            (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(<FileStat>{
                uri: 'file:///home/file',
                lastModification: 0,
                isDirectory: false
            });
            toRestore.push(sinon.stub(wsService, 'opened').value(true));
            wsService.addRoot(new URI())
                .then(() => {
                    done(new Error('WorkspaceService.addRoot() should throw an error but did not.'));
                }).catch(e => {
                    done();
                });
        });

        it('should do nothing if the added uri is already part of the current workspace', async () => {
            const stat = <FileStat>{
                uri: 'file:///home/folder',
                lastModification: 0,
                isDirectory: true
            };
            wsService['_workspace'] = stat;
            wsService['_roots'] = [stat];
            (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(stat);

            await wsService.addRoot(new URI(stat.uri));
            expect(wsService.workspace && wsService.workspace.uri).to.eq(stat.uri);
            expect(wsService.tryGetRoots().length).to.eq(1);
        });

        it('should write new data into the workspace file when the workspace data is stored in a file', async () => {
            const workspaceFileStat = <FileStat>{
                uri: 'file:///home/file',
                lastModification: 0,
                isDirectory: false
            };
            wsService['_workspace'] = workspaceFileStat;
            wsService['_roots'] = [folderA];
            (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(folderB);

            await wsService.addRoot(new URI(folderB.uri));
            expect((<sinon.SinonStub>mockFilesystem.setContent).calledWith(workspaceFileStat,
                JSON.stringify({
                    folders: [
                        { path: 'folderA' }, { path: 'folderB' }
                    ]
                }))).to.be.true;
        });

        [true, false].forEach(existTemporaryWorkspaceFile => {
            it('should write workspace data into a temporary file when theia currently uses a folder as the workspace ' +
                `and the temporary file ${existTemporaryWorkspaceFile ? 'exists' : 'does not exist'}`, async () => {
                    const stubSave = sinon.stub(wsService, 'save').callsFake(() => { });
                    const stubWriteWorkspaceFile = sinon.stub(wsService, <any>'writeWorkspaceFile').callsFake(() => { });
                    toRestore.push(...[stubSave, stubWriteWorkspaceFile]);
                    wsService['_workspace'] = folderA;
                    wsService['_roots'] = [folderA];
                    const homeStat = <FileStat>{
                        uri: 'file:///home/user',
                        lastModification: 0,
                        isDirectory: true
                    };
                    const untitledStat = <FileStat>{
                        uri: 'file:///home/user/.theia/Untitled.theia-workspace',
                        lastModification: 0,
                        isDirectory: true
                    };
                    (<sinon.SinonStub>mockFilesystem.getCurrentUserHome).resolves(homeStat);
                    const stubGetFileStat = <sinon.SinonStub>mockFilesystem.getFileStat;
                    stubGetFileStat.onCall(0).resolves(folderB);
                    (<sinon.SinonStub>mockFilesystem.exists).resolves(existTemporaryWorkspaceFile);
                    const stubCreateFile = <sinon.SinonStub>mockFilesystem.createFile;
                    stubCreateFile.resolves(untitledStat);
                    if (existTemporaryWorkspaceFile) {
                        stubGetFileStat.onCall(1).resolves(untitledStat);
                    }
                    wsService['_workspace'] = folderA;
                    wsService['_roots'] = [folderA];

                    await wsService.addRoot(new URI(folderB.uri));
                    expect(stubCreateFile.calledWith(untitledStat.uri)).to.eq(!existTemporaryWorkspaceFile);
                    expect(stubSave.calledWith(untitledStat)).to.be.true;
                    expect(stubWriteWorkspaceFile.called).to.be.true;
                });
        });
    });

    describe('save() function', () => {
        it('should leave the current workspace unchanged if the passed in uri points to the current workspace', async () => {
            const file = <FileStat>{
                uri: 'file:///home/file',
                lastModification: 0,
                isDirectory: false
            };
            (<sinon.SinonStub>mockFilesystem.exists).resolves(true);
            (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(file);
            wsService['_workspace'] = file;
            const stubSetContent = (<sinon.SinonStub>mockFilesystem.setContent).resolves(file);

            expect(wsService.workspace && wsService.workspace.uri).to.eq(file.uri);
            await wsService.save(new URI(file.uri));
            expect((<sinon.SinonStub>mockWorkspaceServer.setMostRecentlyUsedWorkspace).calledWith(file.uri)).to.be.true;
            expect(stubSetContent.calledWith(file, JSON.stringify({ folders: [] }))).to.be.true;
            expect(wsService.workspace && wsService.workspace.uri).to.eq(file.uri);
        });

        it('should create a new workspace file, save the workspace data into that new file, and update the title of theia', async () => {
            const oldFile = <FileStat>{
                uri: 'file:///home/oldfile',
                lastModification: 0,
                isDirectory: false
            };
            const newFile = <FileStat>{
                uri: 'file:///home/newfile',
                lastModification: 0,
                isDirectory: false
            };
            const stubExist = <sinon.SinonStub>mockFilesystem.exists;
            stubExist.withArgs(oldFile.uri).resolves(true);
            stubExist.withArgs(newFile.uri).resolves(false);
            (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(newFile);
            (<sinon.SinonStub>mockFileSystemWatcher.watchFileChanges).resolves(new DisposableCollection());
            wsService['_workspace'] = oldFile;
            const stubSetContent = (<sinon.SinonStub>mockFilesystem.setContent).resolves(newFile);

            expect(wsService.workspace && wsService.workspace.uri).to.eq(oldFile.uri);
            await wsService.save(new URI(newFile.uri));
            expect((<sinon.SinonStub>mockWorkspaceServer.setMostRecentlyUsedWorkspace).calledWith(newFile.uri)).to.be.true;
            expect(stubSetContent.calledWith(newFile, JSON.stringify({ folders: [] }))).to.be.true;
            expect(wsService.workspace && wsService.workspace.uri).to.eq(newFile.uri);
            expect(updateTitleStub.called).to.be.true;
        });

        it('should use relative paths or translate relative paths to absolute path when necessary before saving', async () => {
            const oldFile = <FileStat>{
                uri: 'file:///home/oldFolder/oldFile',
                lastModification: 0,
                isDirectory: false
            };
            const newFile = <FileStat>{
                uri: 'file:///home/newFolder/newFile',
                lastModification: 0,
                isDirectory: false
            };
            const folder1 = <FileStat>{
                uri: 'file:///home/thirdFolder/folder1',
                lastModification: 0,
                isDirectory: true
            };
            const folder2 = <FileStat>{
                uri: 'file:///home/newFolder/folder2',
                lastModification: 0,
                isDirectory: true
            };
            const stubExist = <sinon.SinonStub>mockFilesystem.exists;
            stubExist.withArgs(oldFile.uri).resolves(true);
            stubExist.withArgs(newFile.uri).resolves(false);
            (<sinon.SinonStub>mockFilesystem.getFileStat).resolves(newFile);
            wsService['_workspace'] = oldFile;
            wsService['_roots'] = [folder1, folder2];
            const stubSetContent = (<sinon.SinonStub>mockFilesystem.setContent).resolves(newFile);
            (<sinon.SinonStub>mockFileSystemWatcher.watchFileChanges).resolves(new DisposableCollection());

            expect(wsService.workspace && wsService.workspace.uri).to.eq(oldFile.uri);
            await wsService.save(new URI(newFile.uri));
            expect((<sinon.SinonStub>mockWorkspaceServer.setMostRecentlyUsedWorkspace).calledWith(newFile.uri)).to.be.true;
            expect(stubSetContent.calledWith(newFile, JSON.stringify({ folders: [{ path: folder1.uri }, { path: 'folder2' }] }))).to.be.true;
            expect(wsService.workspace && wsService.workspace.uri).to.eq(newFile.uri);
            expect(updateTitleStub.called).to.be.true;
        });
    });

    describe('saved status', () => {
        it('should be true if there is an opened workspace, and the opened workspace is not a folder, othewise false', () => {
            const file = <FileStat>{
                uri: 'file:///home/file',
                lastModification: 0,
                isDirectory: false
            };

            expect(wsService.saved).to.be.false;
            wsService['_workspace'] = file;
            expect(wsService.saved).to.be.true;
            wsService['_workspace'] = folderA;
            expect(wsService.saved).to.be.false;
        });
    });

    describe('containsSome() function', () => {
        it('should resolve false if the current workspace is not open', async () => {
            sinon.stub(wsService, 'roots').resolves([]);
            sinon.stub(wsService, 'opened').value(false);
            wsService['_roots'] = [];

            expect(await wsService.containsSome([])).to.be.false;
        });

        it('should resolve false if the passed in paths is an empty array', async () => {
            sinon.stub(wsService, 'roots').resolves([]);
            sinon.stub(wsService, 'opened').value(true);
            wsService['_roots'] = [folderA, folderB];

            expect(await wsService.containsSome([])).to.be.false;
        });

        it('should resolve false if on or more passed in paths are found in the workspace, otherwise false', async () => {
            sinon.stub(wsService, 'roots').value([folderA, folderB]);
            sinon.stub(wsService, 'opened').value(true);
            wsService['_roots'] = [folderA, folderB];

            (<sinon.SinonStub>mockFilesystem.exists).withArgs('file:///home/folderB/subfolder').resolves(true);
            const val = await wsService.containsSome(['A', 'subfolder', 'C']);
            expect(val).to.be.true;
            expect(await wsService.containsSome(['C', 'A', 'B'])).to.be.false;
        });
    });

    describe('removeRoots() function', () => {
        it('should throw an error if the current workspace is not open', done => {
            sinon.stub(wsService, 'opened').value(false);

            wsService.removeRoots([]).then(() => {
                done(new Error('WorkspaceService.removeRoots() should throw an error while did not.'));
            }).catch(e => {
                done();
            });
        });

        it('should not update the workspace file if the workspace is undefined', async () => {
            wsService['_workspace'] = undefined;
            sinon.stub(wsService, 'opened').value(true);
            const stubWriteWorkspaceFile = sinon.stub(wsService, <any>'writeWorkspaceFile');

            await wsService.removeRoots([]);
            expect(stubWriteWorkspaceFile.called).to.be.false;
        });

        it('should update the working space file with remaining folders', async () => {
            const file = <FileStat>{
                uri: 'file:///home/oneFile',
                lastModification: 0,
                isDirectory: false
            };
            wsService['_workspace'] = file;
            sinon.stub(wsService, 'opened').value(true);
            wsService['_roots'] = [folderA, folderB];
            const stubSetContent = <sinon.SinonStub>mockFilesystem.setContent;
            stubSetContent.resolves(file);

            await wsService.removeRoots([new URI()]);
            expect(stubSetContent.calledWith(file, JSON.stringify({ folders: [{ path: 'folderA' }, { path: 'folderB' }] }))).to.be.true;

            await wsService.removeRoots([new URI(folderB.uri)]);
            expect(stubSetContent.calledWith(file, JSON.stringify({ folders: [{ path: 'folderA' }] }))).to.be.true;
        });
    });

    it('should emit roots in the current workspace when initialized', done => {
        const rootA = 'file:///folderA';
        const rootB = 'file:///folderB';
        const statA = <FileStat>{
            uri: rootA,
            lastModification: 0,
            isDirectory: true
        };
        const statB = <FileStat>{
            uri: rootB,
            lastModification: 0,
            isDirectory: true
        };
        const dis = wsService.onWorkspaceChanged(roots => {
            expect(roots.length).to.eq(2);
            expect(roots[0].uri).to.eq(rootA);
            expect(roots[1].uri).to.eq(rootB);
            dis.dispose();
            done();
        });
        toDispose.push(dis);
        wsService['onWorkspaceChangeEmitter'].fire([statA, statB]);
    }).timeout(2000);

    it('should emit updated roots when workspace file is changed', done => {
        const workspaceFileUri = 'file:///home/workspaceFile';
        const workspaceFileStat = <FileStat>{
            uri: workspaceFileUri,
            lastModification: 0,
            isDirectory: false
        };
        wsService['_workspace'] = workspaceFileStat;
        const folderC = <FileStat>{
            uri: 'file:///home/folderC',
            lastModification: 0,
            isDirectory: true
        };

        (<sinon.SinonStub>mockWorkspaceServer.getMostRecentlyUsedWorkspace).resolves(workspaceFileUri);
        const stubGetFileStat = (<sinon.SinonStub>mockFilesystem.getFileStat);
        stubGetFileStat.withArgs(workspaceFileUri).resolves(workspaceFileStat);
        (<sinon.SinonStub>mockFilesystem.exists).resolves(true);
        const oldWorkspaceFileContent = {
            stat: workspaceFileStat,
            content: '{"folders":[{"path":"folderA"},{"path":"folderB"}],"settings":{}}'
        };
        const newWorkspaceFileContent = {
            stat: workspaceFileStat,
            content: '{"folders":[{"path":"folderB"},{"path":"folderC"}],"settings":{}}'
        };
        (<sinon.SinonStub>mockFilesystem.resolveContent).onCall(0).resolves(oldWorkspaceFileContent);
        (<sinon.SinonStub>mockFilesystem.resolveContent).onCall(1).resolves(newWorkspaceFileContent);
        (<sinon.SinonStub>mockFilesystem.resolveContent).onCall(2).resolves(newWorkspaceFileContent);
        stubGetFileStat.withArgs(folderA.uri).resolves(folderA);
        stubGetFileStat.withArgs(folderB.uri).resolves(folderB);
        stubGetFileStat.withArgs(folderC.uri).resolves(folderC);
        (<sinon.SinonStub>mockFileSystemWatcher.watchFileChanges).resolves(new DisposableCollection());

        wsService['init']().then(() => {
            const dis = wsService.onWorkspaceChanged(roots => {
                expect(roots.length).to.eq(2);
                expect(roots[0].uri).to.eq(folderB.uri);
                expect(roots[1].uri).to.eq(folderC.uri);
                dis.dispose();
                done();
            });
            toDispose.push(dis);
            mockFileChangeEmitter.fire([{ uri: new URI(workspaceFileUri), type: FileChangeType.UPDATED }]);
        });
    }).timeout(2000);
});
