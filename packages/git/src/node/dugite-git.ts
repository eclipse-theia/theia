/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs';
import * as Path from 'path';
import { injectable, inject } from "inversify";
import { git } from 'dugite-extra/lib/core/git';
import { push } from 'dugite-extra/lib/command/push';
import { pull } from 'dugite-extra/lib/command/pull';
import { clone } from 'dugite-extra/lib/command/clone';
import { fetch } from 'dugite-extra/lib/command/fetch';
import { merge } from 'dugite-extra/lib/command/merge';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { getStatus } from 'dugite-extra/lib/command/status';
import { createCommit } from 'dugite-extra/lib/command/commit';
import { stage, unstage } from 'dugite-extra/lib/command/stage';
import { reset, GitResetMode } from 'dugite-extra/lib/command/reset';
import { getTextContents, getBlobContents } from 'dugite-extra/lib/command/show';
import { checkoutBranch, checkoutPaths } from 'dugite-extra/lib/command/checkout';
import { createBranch, deleteBranch, renameBranch, listBranch } from 'dugite-extra/lib/command/branch';
import { IStatusResult, IAheadBehind, AppFileStatus, WorkingDirectoryStatus as DugiteStatus, FileChange as DugiteFileChange } from 'dugite-extra/lib/model/status';
import { Branch as DugiteBranch } from 'dugite-extra/lib/model/branch';
import { Commit as DugiteCommit, CommitIdentity as DugiteCommitIdentity } from 'dugite-extra/lib/model/commit';
import { ILogger } from '@theia/core';
import { Git, GitUtils, Repository, WorkingDirectoryStatus, GitFileChange, GitFileStatus, Branch, Commit, CommitIdentity } from '../common';
import { GitRepositoryManager } from './git-repository-manager';
import { GitLocator } from './git-locator/git-locator-protocol';

/**
 * `dugite-extra` based Git implementation.
 */
@injectable()
export class DugiteGit implements Git {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(GitLocator)
    protected readonly locator: GitLocator;

    @inject(GitRepositoryManager)
    protected readonly manager: GitRepositoryManager;

    dispose(): void {
        this.locator.dispose();
    }

    async clone(remoteUrl: string, options: Git.Options.Clone): Promise<Repository> {
        const { localUri } = options;
        await clone(remoteUrl, this.getFsPath(localUri));
        return { localUri };
    }

    async repositories(workspaceRootUri: string, options: Git.Options.Repositories): Promise<Repository[]> {
        const workspaceRootPath = this.getFsPath(workspaceRootUri);
        const repositories: Repository[] = [];
        const containingPath = await this.resolveContainingPath(workspaceRootPath);
        if (containingPath) {
            repositories.push({
                localUri: this.getUri(containingPath)
            });
        }
        const maxCount = options.maxCount ? options.maxCount - repositories.length : undefined;
        if (!!maxCount && maxCount <= 0) {
            return repositories;
        }
        for (const repositoryPath of await this.locator.locate(workspaceRootPath, {
            maxCount
        })) {
            if (containingPath !== repositoryPath) {
                repositories.push({
                    localUri: this.getUri(repositoryPath)
                });
            }
        }
        return repositories;
    }

    async status(repository: Repository): Promise<WorkingDirectoryStatus> {
        const repositoryPath = this.getFsPath(repository);
        const dugiteStatus = await getStatus(repositoryPath);
        return this.mapStatus(dugiteStatus, repository);
    }

    async add(repository: Repository, uri: string | string[]): Promise<void> {
        const paths = (Array.isArray(uri) ? uri : [uri]).map(FileUri.fsPath);
        return this.manager.run(repository, () =>
            stage(this.getFsPath(repository), paths)
        );
    }

    async unstage(repository: Repository, uri: string | string[]): Promise<void> {
        const paths = (Array.isArray(uri) ? uri : [uri]).map(FileUri.fsPath);
        return this.manager.run(repository, () =>
            unstage(this.getFsPath(repository), paths)
        );
    }

    async branch(repository: Repository, options: { type: 'current' }): Promise<Branch | undefined>;
    async branch(repository: Repository, options: { type: 'local' | 'remote' | 'all' }): Promise<Branch[]>;
    async branch(repository: Repository, options: Git.Options.Branch.Create | Git.Options.Branch.Rename | Git.Options.Branch.Delete): Promise<void>;
    // tslint:disable-next-line:no-any
    async branch(repository: any, options: any): Promise<void | undefined | Branch | Branch[]> {
        const repositoryPath = this.getFsPath(repository);
        if (GitUtils.isBranchList(options)) {
            if (options.type === 'current') {
                const currentBranch = await listBranch(repositoryPath, options.type);
                return currentBranch ? this.mapBranch(currentBranch) : undefined;
            }
            const branches = await listBranch(repositoryPath, options.type);
            return Promise.all(branches.map(branch => this.mapBranch(branch)));
        }
        return this.manager.run(repository, () => {
            if (GitUtils.isBranchCreate(options)) {
                return createBranch(repositoryPath, options.toCreate, { startPoint: options.startPoint });
            }
            if (GitUtils.isBranchRename(options)) {
                return renameBranch(repositoryPath, options.newName, options.newName, { force: !!options.force });
            }
            if (GitUtils.isBranchDelete(options)) {
                return deleteBranch(repositoryPath, options.toDelete, { force: !!options.force, remote: !!options.remote });
            }
            return this.fail(repository, `Unexpected git branch options: ${options}.`);
        });
    }

    checkout(repository: Repository, options: Git.Options.Checkout.Branch | Git.Options.Checkout.WorkingTreeFile): Promise<void> {
        return this.manager.run(repository, () => {
            const repositoryPath = this.getFsPath(repository);
            if (GitUtils.isBranchCheckout(options)) {
                return checkoutBranch(repositoryPath, options.branch);
            }
            if (GitUtils.isWorkingTreeFileCheckout(options)) {
                const paths = (Array.isArray(options.paths) ? options.paths : [options.paths]).map(FileUri.fsPath);
                return checkoutPaths(repositoryPath, paths);
            }
            return this.fail(repository, `Unexpected git checkout options: ${options}.`);
        });
    }

    async commit(repository: Repository, message?: string): Promise<void> {
        return this.manager.run(repository, () =>
            createCommit(this.getFsPath(repository), message || '')
        );
    }

    async fetch(repository: Repository, options?: Git.Options.Fetch): Promise<void> {
        const repositoryPath = this.getFsPath(repository);
        const r = await this.getDefaultRemote(repositoryPath, options ? options.remote : undefined);
        if (r === undefined) {
            this.fail(repository, `No remote repository specified. Please, specify either a URL or a remote name from which new revisions should be fetched.`);
        }
        return this.manager.run(repository, () =>
            fetch(repositoryPath, r!)
        );
    }

    async push(repository: Repository, options?: Git.Options.Push): Promise<void> {
        const repositoryPath = this.getFsPath(repository);
        const r = await this.getDefaultRemote(repositoryPath, options ? options.remote : undefined);
        if (r === undefined) {
            this.fail(repository, `No configured push destination.`);
        }
        const localBranch = await this.getCurrentBranch(repositoryPath, options ? options.localBranch : undefined);
        const localBranchName = typeof localBranch === 'string' ? localBranch : localBranch.name;
        const remoteBranch = options ? options.remoteBranch : undefined;
        return this.manager.run(repository, () =>
            push(repositoryPath, r!, localBranchName, remoteBranch)
        );
    }

    async pull(repository: Repository, options?: Git.Options.Pull): Promise<void> {
        const repositoryPath = this.getFsPath(repository);
        const r = await this.getDefaultRemote(repositoryPath, options ? options.remote : undefined);
        if (r === undefined) {
            this.fail(repository, `No remote repository specified. Please, specify either a URL or a remote name from which new revisions should be fetched.`);
        }
        return this.manager.run(repository, () => {
            if (options && options.branch) {
                return pull(repositoryPath, r!, options.branch);
            }
            return pull(repositoryPath, r!);
        });
    }

    reset(repository: Repository, options: Git.Options.Reset): Promise<void> {
        const repositoryPath = this.getFsPath(repository);
        const mode = this.getResetMode(options.mode);
        return this.manager.run(repository, () =>
            reset(repositoryPath, mode, options.mode ? options.mode : 'HEAD')
        );
    }

    merge(repository: Repository, options: Git.Options.Merge): Promise<void> {
        const repositoryPath = this.getFsPath(repository);
        return this.manager.run(repository, () =>
            merge(repositoryPath, options.branch)
        );
    }

    async show(repository: Repository, uri: string, options?: Git.Options.Show): Promise<string> {
        const encoding = options ? options.encoding || 'utf8' : 'utf8';
        const commitish = this.getCommitish(options);
        const repositoryPath = this.getFsPath(repository);
        const path = this.getFsPath(uri);
        if (encoding === 'binary') {
            return (await getBlobContents(repositoryPath, commitish, path)).toString();
        }
        return (await getTextContents(repositoryPath, commitish, path)).toString();
    }

    async remote(repository: Repository): Promise<string[]> {
        const repositoryPath = this.getFsPath(repository);
        return this.getRemotes(repositoryPath);
    }

    private getCommitish(options?: Git.Options.Show): string {
        if (options && options.commitish) {
            return 'index' === options.commitish ? '' : options.commitish;
        }
        return '';
    }

    // TODO: akitta what about symlinks? What if the workspace root is a symlink?
    // Maybe, we should use `--show-cdup` here instead of `--show-toplevel` because `show-toplevel` dereferences symlinks.
    private async resolveContainingPath(repositoryPath: string): Promise<string | undefined> {
        // Do not log an error if we are not contained in a Git repository. Treat exit code 128 as a success too.
        const options = { successExitCodes: new Set([0, 128]) };
        const result = await git(['rev-parse', '--show-toplevel'], repositoryPath, 'rev-parse', options);
        const out = result.stdout;
        if (out && out.length !== 0) {
            try {
                return fs.realpathSync(out.trim());
            } catch (e) {
                this.logger.error(e);
                return undefined;
            }
        }
        return undefined;
    }

    private async getRemotes(repositoryPath: string): Promise<string[]> {
        const result = await git(['remote'], repositoryPath, 'remote');
        const out = result.stdout || '';
        return out.trim().match(/\S+/g) || [];
    }

    private async getDefaultRemote(repositoryPath: string, remote?: string): Promise<string | undefined> {
        if (remote === undefined) {
            const remotes = await this.getRemotes(repositoryPath);
            return remotes.shift();
        }
        return remote;
    }

    private async getCurrentBranch(repositoryPath: string, localBranch?: string): Promise<Branch | string> {
        if (localBranch !== undefined) {
            return localBranch;
        }
        const branch = await listBranch(repositoryPath, 'current');
        if (branch === undefined) {
            return this.fail(repositoryPath, `No current branch.`);
        }
        if (Array.isArray(branch)) {
            return this.fail(repositoryPath, `Implementation error. Listing branch with the 'current' flag must return with single value. Was: ${branch}`);
        }
        return this.mapBranch(branch);
    }

    private getResetMode(mode: 'hard' | 'soft' | 'mixed') {
        switch (mode) {
            case 'hard': return GitResetMode.Hard;
            case 'soft': return GitResetMode.Soft;
            case 'mixed': return GitResetMode.Mixed;
            default: throw new Error(`Unexpected Git reset mode: ${mode}.`);
        }
    }

    private async mapBranch(toMap: DugiteBranch): Promise<Branch> {
        const tip = await this.mapTip(toMap.tip);
        return {
            name: toMap.name,
            nameWithoutRemote: toMap.nameWithoutRemote,
            remote: toMap.remote,
            type: toMap.type,
            upstream: toMap.upstream,
            upstreamWithoutRemote: toMap.upstreamWithoutRemote,
            tip
        };
    }

    private async mapTip(toMap: DugiteCommit): Promise<Commit> {
        const author = await this.mapCommitIdentity(toMap.author);
        return {
            author,
            body: toMap.body,
            parentSHAs: [...toMap.parentSHAs],
            sha: toMap.sha,
            summary: toMap.summary
        };
    }

    private async mapCommitIdentity(toMap: DugiteCommitIdentity): Promise<CommitIdentity> {
        return {
            date: toMap.date,
            email: toMap.email,
            name: toMap.name,
            tzOffset: toMap.tzOffset
        };
    }

    private async mapStatus(toMap: IStatusResult, repository: Repository): Promise<WorkingDirectoryStatus> {
        const repositoryPath = this.getFsPath(repository);
        const aheadBehindPromise = this.mapAheadBehind(toMap.branchAheadBehind);
        const changesPromise = this.mapFileChanges(toMap.workingDirectory, repositoryPath);
        const aheadBehind = await aheadBehindPromise;
        const changes = await changesPromise;
        return {
            exists: toMap.exists,
            branch: toMap.currentBranch,
            upstreamBranch: toMap.currentUpstreamBranch,
            aheadBehind,
            changes,
            currentHead: toMap.currentTip
        };
    }

    private async mapAheadBehind(toMap: IAheadBehind | undefined): Promise<{ ahead: number, behind: number } | undefined> {
        return toMap ? { ...toMap } : undefined;
    }

    private async mapFileChanges(toMap: DugiteStatus, repositoryPath: string): Promise<GitFileChange[]> {
        return Promise.all(toMap.files.map(file => this.mapFileChange(file, repositoryPath)));
    }

    private async mapFileChange(toMap: DugiteFileChange, repositoryPath: string): Promise<GitFileChange> {
        const uriPromise = this.getUri(Path.join(repositoryPath, toMap.path));
        const statusPromise = this.mapFileStatus(toMap.status);
        const oldUriPromise = toMap.oldPath ? this.getUri(Path.join(repositoryPath, toMap.oldPath)) : undefined;
        const uri = await uriPromise;
        const status = await statusPromise;
        const oldUri = await oldUriPromise;
        return {
            uri,
            status,
            oldUri,
            staged: toMap.staged
        };
    }

    private mapFileStatus(toMap: AppFileStatus): GitFileStatus {
        switch (toMap) {
            case AppFileStatus.Conflicted: return GitFileStatus.Conflicted;
            case AppFileStatus.Copied: return GitFileStatus.Copied;
            case AppFileStatus.Deleted: return GitFileStatus.Deleted;
            case AppFileStatus.Modified: return GitFileStatus.Modified;
            case AppFileStatus.New: return GitFileStatus.New;
            case AppFileStatus.Renamed: return GitFileStatus.Renamed;
            default: throw new Error(`Unexpected application file status: ${toMap}`);
        }
    }

    private getFsPath(repository: Repository | string): string {
        const uri = typeof repository === 'string' ? repository : repository.localUri;
        return FileUri.fsPath(uri);
    }

    private getUri(path: string): string {
        return FileUri.create(path).toString();
    }

    private fail(repository: Repository | string, message?: string): never {
        const p = typeof repository === 'string' ? repository : repository.localUri;
        const m = message ? `${message} ` : '';
        throw new Error(`${m}[${p}]`);
    }

}
