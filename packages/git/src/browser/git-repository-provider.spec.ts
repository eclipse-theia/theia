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
import { Git, Repository } from '../common';
import { DugiteGit } from '../node/dugite-git';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import { FileSystemWatcher } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { FileSystemNode } from '@theia/filesystem/lib/node/node-filesystem';
import { FileChange } from '@theia/filesystem/lib/browser';
import { Emitter, CommandService } from '@theia/core';
import { LocalStorageService, StorageService, LabelProvider } from '@theia/core/lib/browser';
import { GitRepositoryProvider } from './git-repository-provider';
import * as sinon from 'sinon';
import * as chai from 'chai';
import { GitCommitMessageValidator } from './git-commit-message-validator';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ScmContextKeyService } from '@theia/scm/lib/browser/scm-context-key-service';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { GitScmProvider } from './git-scm-provider';
import { EditorManager } from '@theia/editor/lib/browser';
import { GitErrorHandler } from './git-error-handler';
const expect = chai.expect;

disableJSDOM();

const folderA = <FileStat>{
    uri: 'file:///home/repoA',
    lastModification: 0,
    isDirectory: true
};
const repoA1 = <Repository>{
    localUri: `${folderA.uri}/1`
};
const repoA2 = <Repository>{
    localUri: `${folderA.uri}/2`
};

const folderB = <FileStat>{
    uri: 'file:///home/repoB',
    lastModification: 0,
    isDirectory: true
};
const repoB = <Repository>{
    localUri: folderB.uri
};

// tslint:disable:no-any
describe('GitRepositoryProvider', () => {
    let testContainer: Container;

    let mockGit: DugiteGit;
    let mockWorkspaceService: WorkspaceService;
    let mockFilesystem: FileSystem;
    let mockFileSystemWatcher: FileSystemWatcher;
    let mockStorageService: StorageService;

    let gitRepositoryProvider: GitRepositoryProvider;
    const mockRootChangeEmitter: Emitter<FileStat[]> = new Emitter();
    const mockFileChangeEmitter: Emitter<FileChange[]> = new Emitter();

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        mockGit = sinon.createStubInstance(DugiteGit);
        mockWorkspaceService = sinon.createStubInstance(WorkspaceService);
        mockFilesystem = sinon.createStubInstance(FileSystemNode);
        mockFileSystemWatcher = sinon.createStubInstance(FileSystemWatcher);
        mockStorageService = sinon.createStubInstance(LocalStorageService);

        testContainer = new Container();
        testContainer.bind(GitRepositoryProvider).toSelf().inSingletonScope();
        testContainer.bind(Git).toConstantValue(mockGit);
        testContainer.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
        testContainer.bind(FileSystem).toConstantValue(mockFilesystem);
        testContainer.bind(FileSystemWatcher).toConstantValue(mockFileSystemWatcher);
        testContainer.bind(StorageService).toConstantValue(mockStorageService);
        testContainer.bind(ScmService).toSelf().inSingletonScope();
        testContainer.bind(GitScmProvider.Factory).toFactory(GitScmProvider.createFactory);
        testContainer.bind(ScmContextKeyService).toSelf().inSingletonScope();
        testContainer.bind(ContextKeyService).toSelf().inSingletonScope();
        testContainer.bind(GitCommitMessageValidator).toSelf().inSingletonScope();
        testContainer.bind(EditorManager).toConstantValue(<EditorManager>{});
        testContainer.bind(GitErrorHandler).toConstantValue(<GitErrorHandler>{});
        testContainer.bind(CommandService).toConstantValue(<CommandService>{});
        testContainer.bind(LabelProvider).toConstantValue(<LabelProvider>{});

        sinon.stub(mockWorkspaceService, 'onWorkspaceChanged').value(mockRootChangeEmitter.event);
        (mockFileSystemWatcher['onFilesChanged'] as any) = mockFileChangeEmitter.event;
    });

    it('should adds all existing git repo(s) on theia loads', async () => {
        const allRepos = [repoA1, repoA2];
        const roots = [folderA];
        (<sinon.SinonStub>mockStorageService.getData).withArgs('theia-git-selected-repository').resolves(allRepos[0]);
        (<sinon.SinonStub>mockStorageService.getData).withArgs('theia-git-all-repositories').resolves(allRepos);
        sinon.stub(mockWorkspaceService, 'roots').value(Promise.resolve(roots));
        (<sinon.SinonStub>mockWorkspaceService.tryGetRoots).returns(roots);
        gitRepositoryProvider = testContainer.get<GitRepositoryProvider>(GitRepositoryProvider);
        (<sinon.SinonStub>mockFilesystem.exists).resolves(true);
        (<sinon.SinonStub>mockGit.repositories).withArgs(folderA.uri, {}).resolves(allRepos);

        await gitRepositoryProvider['initialize']();
        expect(gitRepositoryProvider.allRepositories.length).to.eq(allRepos.length);
        expect(gitRepositoryProvider.allRepositories[0].localUri).to.eq(allRepos[0].localUri);
        expect(gitRepositoryProvider.allRepositories[1].localUri).to.eq(allRepos[1].localUri);
        expect(gitRepositoryProvider.selectedRepository && gitRepositoryProvider.selectedRepository.localUri).to.eq(allRepos[0].localUri);
    });

    // tslint:disable-next-line:no-void-expression
    it.skip('should refresh git repo(s) on receiving a root change event from WorkspaceService', done => {
        const allReposA = [repoA1, repoA2];
        const oldRoots = [folderA];
        const allReposB = [repoB];
        (<sinon.SinonStub>mockStorageService.getData).withArgs('theia-git-selected-repository').resolves(allReposA[0]);
        (<sinon.SinonStub>mockStorageService.getData).withArgs('theia-git-all-repositories').resolves(allReposA);
        sinon.stub(mockWorkspaceService, 'roots').resolves(oldRoots);
        const stubWsRoots = <sinon.SinonStub>mockWorkspaceService.tryGetRoots;
        stubWsRoots.returns(oldRoots);
        gitRepositoryProvider = testContainer.get<GitRepositoryProvider>(GitRepositoryProvider);
        (<sinon.SinonStub>mockFilesystem.exists).resolves(true);
        (<sinon.SinonStub>mockGit.repositories).withArgs(folderA.uri, {}).resolves(allReposA);
        (<sinon.SinonStub>mockGit.repositories).withArgs(folderB.uri, {}).resolves(allReposB);

        let counter = 0;
        gitRepositoryProvider.onDidChangeRepository(selected => {
            counter++;
            if (counter === 3) {
                expect(gitRepositoryProvider.allRepositories.length).to.eq(allReposA.concat(allReposB).length);
                expect(gitRepositoryProvider.allRepositories[0].localUri).to.eq(allReposA[0].localUri);
                expect(gitRepositoryProvider.allRepositories[1].localUri).to.eq(allReposA[1].localUri);
                expect(gitRepositoryProvider.allRepositories[2].localUri).to.eq(allReposB[0].localUri);
                expect(selected && selected.localUri).to.eq(allReposA[0].localUri);
                done();
            }
        });
        gitRepositoryProvider['initialize']().then(() => {
            const newRoots = [folderA, folderB];
            stubWsRoots.returns(newRoots);
            sinon.stub(mockWorkspaceService, 'roots').resolves(newRoots);
            mockRootChangeEmitter.fire(newRoots);
        }).catch(e =>
            done(new Error('gitRepositoryProvider.initialize() throws an error'))
        );
    });

    // tslint:disable-next-line:no-void-expression
    it.skip('should refresh git repo(s) on receiving a file system change event', done => {
        const allReposA = [repoA1, repoA2];
        const oldRoots = [folderA];
        const allReposB = [repoB];
        const newRoots = [folderA, folderB];
        (<sinon.SinonStub>mockStorageService.getData).withArgs('theia-git-selected-repository').resolves(allReposA[0]);
        (<sinon.SinonStub>mockStorageService.getData).withArgs('theia-git-all-repositories').resolves(allReposA);
        sinon.stub(mockWorkspaceService, 'roots').onCall(0).resolves(oldRoots);
        sinon.stub(mockWorkspaceService, 'roots').onCall(1).resolves(oldRoots);
        sinon.stub(mockWorkspaceService, 'roots').onCall(2).resolves(newRoots);
        const stubWsRoots = <sinon.SinonStub>mockWorkspaceService.tryGetRoots;
        stubWsRoots.onCall(0).returns(oldRoots);
        stubWsRoots.onCall(1).returns(oldRoots);
        stubWsRoots.onCall(2).returns(newRoots);
        gitRepositoryProvider = testContainer.get<GitRepositoryProvider>(GitRepositoryProvider);
        (<sinon.SinonStub>mockFilesystem.exists).resolves(true);
        (<sinon.SinonStub>mockGit.repositories).withArgs(folderA.uri, {}).resolves(allReposA);
        (<sinon.SinonStub>mockGit.repositories).withArgs(folderB.uri, {}).resolves(allReposB);

        let counter = 0;
        gitRepositoryProvider.onDidChangeRepository(selected => {
            counter++;
            if (counter === 3) {
                expect(gitRepositoryProvider.allRepositories.length).to.eq(allReposA.concat(allReposB).length);
                expect(gitRepositoryProvider.allRepositories[0].localUri).to.eq(allReposA[0].localUri);
                expect(gitRepositoryProvider.allRepositories[1].localUri).to.eq(allReposA[1].localUri);
                expect(gitRepositoryProvider.allRepositories[2].localUri).to.eq(allReposB[0].localUri);
                expect(selected && selected.localUri).to.eq(allReposA[0].localUri);
                done();
            }
        });
        gitRepositoryProvider['initialize']().then(() =>
            mockFileChangeEmitter.fire([])
        ).catch(e =>
            done(new Error('gitRepositoryProvider.initialize() throws an error'))
        );
    });

    // tslint:disable-next-line:no-void-expression
    it.skip('should ignore the invalid or nonexistent root(s)', async () => {
        const allReposA = [repoA1, repoA2];
        const roots = [folderA, folderB];
        (<sinon.SinonStub>mockStorageService.getData).withArgs('theia-git-selected-repository').resolves(allReposA[0]);
        (<sinon.SinonStub>mockStorageService.getData).withArgs('theia-git-all-repositories').resolves(allReposA);
        sinon.stub(mockWorkspaceService, 'roots').value(Promise.resolve(roots));
        (<sinon.SinonStub>mockWorkspaceService.tryGetRoots).returns(roots);
        gitRepositoryProvider = testContainer.get<GitRepositoryProvider>(GitRepositoryProvider);
        (<sinon.SinonStub>mockFilesystem.exists).withArgs(folderA.uri).resolves(true); // folderA exists
        (<sinon.SinonStub>mockFilesystem.exists).withArgs(folderB.uri).resolves(false); // folderB does not exist
        (<sinon.SinonStub>mockGit.repositories).withArgs(folderA.uri, {}).resolves(allReposA);

        await gitRepositoryProvider['initialize']();
        expect(gitRepositoryProvider.allRepositories.length).to.eq(allReposA.length);
        expect(gitRepositoryProvider.allRepositories[0].localUri).to.eq(allReposA[0].localUri);
        expect(gitRepositoryProvider.allRepositories[1].localUri).to.eq(allReposA[1].localUri);
        expect(gitRepositoryProvider.selectedRepository && gitRepositoryProvider.selectedRepository.localUri).to.eq(allReposA[0].localUri);
    });

    it('should mark the first repo in the first root as "selectedRepository", if the "selectedRepository" is unavailable in the first place', async () => {
        const allReposA = [repoA1, repoA2];
        const roots = [folderA, folderB];
        const allReposB = [repoB];
        (<sinon.SinonStub>mockStorageService.getData).withArgs('theia-git-selected-repository').resolves(undefined);
        (<sinon.SinonStub>mockStorageService.getData).withArgs('theia-git-all-repositories').resolves(undefined);
        sinon.stub(mockWorkspaceService, 'roots').value(Promise.resolve(roots));
        (<sinon.SinonStub>mockWorkspaceService.tryGetRoots).returns(roots);
        gitRepositoryProvider = testContainer.get<GitRepositoryProvider>(GitRepositoryProvider);
        (<sinon.SinonStub>mockFilesystem.exists).resolves(true);
        (<sinon.SinonStub>mockGit.repositories).withArgs(folderA.uri, {}).resolves(allReposA);
        (<sinon.SinonStub>mockGit.repositories).withArgs(folderA.uri, { maxCount: 1 }).resolves([allReposA[0]]);
        (<sinon.SinonStub>mockGit.repositories).withArgs(folderB.uri, {}).resolves(allReposB);
        (<sinon.SinonStub>mockGit.repositories).withArgs(folderB.uri, { maxCount: 1 }).resolves([allReposB[0]]);

        await gitRepositoryProvider['initialize']();
        expect(gitRepositoryProvider.selectedRepository && gitRepositoryProvider.selectedRepository.localUri).to.eq(allReposA[0].localUri);
    });
});
