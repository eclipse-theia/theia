// *****************************************************************************
// Copyright (C) 2022 Toro Cloud Pty Ltd and others.
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

import { CommandService, Disposable, ILogger, MessageService } from '@theia/core';
import { LabelProvider, OpenerService } from '@theia/core/lib/browser';
import { FileUri } from '@theia/core/lib/node';
import { Container } from '@theia/core/shared/inversify';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { ScmInput } from '@theia/scm/lib/browser/scm-input';
import { expect } from 'chai';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { rimraf } from 'rimraf';
import * as sinon from 'sinon';
import { Git, GitFileStatus, Repository } from '../common';
import { DugiteGit } from '../node/dugite-git';
import { DefaultGitEnvProvider, GitEnvProvider } from '../node/env/git-env-provider';
import { bindGit } from '../node/git-backend-module';
import { GitRepositoryWatcher, GitRepositoryWatcherFactory } from '../node/git-repository-watcher';
import { GitErrorHandler } from './git-error-handler';
import { GitPreferences } from './git-preferences';
import { GitScmProvider, GitScmProviderOptions } from './git-scm-provider';

disableJSDOM();

describe('GitScmProvider', () => {
    let testContainer: Container;
    let mockOpenerService: OpenerService;
    let mockEditorManager: EditorManager;
    let mockGitErrorHandler: GitErrorHandler;
    let mockFileService: FileService;
    let git: Git;
    let mockCommandService: CommandService;
    let mockLabelProvider: LabelProvider;
    let gitScmProvider: GitScmProvider;
    const repository: Repository = {
        localUri: FileUri.create(path.join(os.tmpdir(), 'GitScmProvider.test', 'repoA')).toString()
    };

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(async () => {
        disableJSDOM();
    });

    beforeEach(async () => {
        mockOpenerService = {} as OpenerService;
        mockEditorManager = sinon.createStubInstance(EditorManager);
        mockGitErrorHandler = sinon.createStubInstance(GitErrorHandler);
        mockFileService = sinon.createStubInstance(FileService);
        git = sinon.createStubInstance(DugiteGit);
        mockCommandService = {} as CommandService;
        mockLabelProvider = sinon.createStubInstance(LabelProvider);

        testContainer = new Container();
        testContainer.bind(OpenerService).toConstantValue(mockOpenerService);
        testContainer.bind(EditorManager).toConstantValue(mockEditorManager);
        testContainer.bind(GitErrorHandler).toConstantValue(mockGitErrorHandler);
        testContainer.bind(FileService).toConstantValue(mockFileService);
        testContainer.bind(ILogger).toConstantValue(console);
        testContainer.bind(GitEnvProvider).to(DefaultGitEnvProvider);
        bindGit(testContainer.bind.bind(testContainer));

        // We have to mock the watcher because it runs after the afterEach
        // which removes the git repository, causing an error in the watcher
        // which tries to get the git repo status.
        testContainer.rebind(GitRepositoryWatcherFactory).toConstantValue(() => {
            const mockWatcher = sinon.createStubInstance(GitRepositoryWatcher);
            mockWatcher.sync.resolves();
            return mockWatcher;
        });

        testContainer.bind(MessageService).toConstantValue(sinon.createStubInstance(MessageService));
        testContainer.bind(CommandService).toConstantValue(mockCommandService);
        testContainer.bind(LabelProvider).toConstantValue(mockLabelProvider);
        testContainer.bind(GitPreferences).toConstantValue({ onPreferenceChanged: () => Disposable.NULL });
        testContainer.bind(GitScmProviderOptions).toConstantValue({
            repository
        } as GitScmProviderOptions);
        testContainer.bind(GitScmProvider).toSelf();
        gitScmProvider = testContainer.get(GitScmProvider);
        gitScmProvider.input = sinon.createStubInstance(ScmInput);

        git = testContainer.get(Git);
        await fs.mkdirp(FileUri.fsPath(repository.localUri));
        await git.exec(repository, ['init']);
    });

    afterEach(async () => {
        await rimraf(FileUri.fsPath(repository.localUri));
    });

    it('should unstage all the changes', async () => {
        const uris = [
            repository.localUri + '/test1.txt',
            repository.localUri + '/test2.txt'
        ];

        await Promise.all(uris.map(uri => fs.createFile(FileUri.fsPath(uri))));

        await git.add(repository, uris);

        gitScmProvider.setStatus({
            changes: uris.map(uri => ({
                status: GitFileStatus.New,
                uri,
                staged: true
            })),
            exists: true
        });
        expect(gitScmProvider.stagedChanges.length).to.eq(2);

        await gitScmProvider.unstageAll();

        const status = await git.status(repository);
        expect(status.changes.filter(change => change.staged).length).to.eq(0);
        expect(status.changes.filter(change => !change.staged).length).to.eq(2);
    });
});
