/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import * as Path from 'path';
import { Git, GitUtils } from '../common/git';
import { git } from 'dugite-extra/lib/core/git';
import { injectable, inject } from "inversify";
import { FileUri } from '@theia/core/lib/node/file-uri';
import { getStatus } from 'dugite-extra/lib/command/status';
import { clone } from 'dugite-extra/lib/command/clone';
import { createCommit } from 'dugite-extra/lib/command/commit';
import { getTextContents, getBlobContents } from 'dugite-extra/lib/command/show';
import { createBranch, deleteBranch, renameBranch, listBranch } from 'dugite-extra/lib/command/branch';
import { stage, unstage } from 'dugite-extra/lib/command/stage';
import { locateRepositories } from './git-repository-locator';
import { WorkspaceServer } from '@theia/workspace/lib/common/workspace-protocol';
import { Repository, WorkingDirectoryStatus, GitFileChange, GitFileStatus } from '../common/model';
import { IStatusResult, IAheadBehind, AppFileStatus, WorkingDirectoryStatus as DugiteStatus, FileChange as DugiteFileChange } from 'dugite-extra/lib/model/status';

/**
 * `dugite-extra` based Git implementation.
 */
@injectable()
export class DugiteGit implements Git {

    constructor(
        @inject(WorkspaceServer) protected readonly workspace: WorkspaceServer) {
    }

    async clone(remoteUrl: string, options?: Git.Options.Clone): Promise<Repository> {
        const localUri = options && options.localUri ? options.localUri : await this.workspace.getRoot();
        await clone(remoteUrl, localUri);
        return { localUri };
    }

    async repositories(): Promise<Repository[]> {
        const workspaceRoot = await this.workspace.getRoot();
        const path = await getFsPath(workspaceRoot);
        const repositoriesPromise = locateRepositories(path);
        const containerRepositoryPromise = this.getContainerRepository(path);
        const repositories = await repositoriesPromise;
        const containerRepository = await containerRepositoryPromise;
        if (containerRepository) {
            repositories.unshift(containerRepository);
        }
        return repositories;
    }

    async status(repository: Repository): Promise<WorkingDirectoryStatus> {
        const repositoryPath = await getFsPath(repository);
        const dugiteStatus = await getStatus(repositoryPath);
        return mapStatus(dugiteStatus, repository);
    }

    async add(repository: Repository, uri: string | string[]): Promise<void> {
        const paths = (Array.isArray(uri) ? uri : [uri]).map(FileUri.fsPath);
        return stage(FileUri.fsPath(repository.localUri), paths);
    }

    async rm(repository: Repository, uri: string | string[]): Promise<void> {
        const paths = (Array.isArray(uri) ? uri : [uri]).map(FileUri.fsPath);
        return unstage(FileUri.fsPath(repository.localUri), paths);
    }

    async branch(repository: Repository,
        options: Git.Options.Branch.List |
            Git.Options.Branch.Create |
            Git.Options.Branch.Rename |
            Git.Options.Branch.Delete): Promise<void | undefined | string | string[]> {

        const { localUri } = repository;
        if (GitUtils.isList(options)) {
            const branches = await listBranch(localUri, options.type);
            if (Array.isArray(branches)) {
                return branches.map(b => b.name);
            } else {
                return branches ? branches.name : undefined;
            }
        } else {
            if (GitUtils.isCreate(options)) {
                return createBranch(localUri, options.toCreate, { startPoint: options.startPoint });
            } else if (GitUtils.isRename(options)) {
                return renameBranch(localUri, options.newName, options.newName, { force: !!options.force });
            } else if (GitUtils.isDelete(options)) {
                return deleteBranch(localUri, options.toDelete, { force: !!options.force, remote: !!options.remote });
            } else {
                throw new Error(`Unknown git branch options: ${options}.`);
            }
        }
    }

    async checkout(repository: Repository, options: Git.Options.Checkout.Branch | Git.Options.Checkout.WorkingTreeFile): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async commit(repository: Repository, message?: string): Promise<void> {
        return createCommit(repository.localUri, message || '');
    }

    async fetch(repository: Repository): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async push(repository: Repository): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async pull(repository: Repository): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async reset(repository: Repository, mode: "hard" | "soft" | "mixed", ref?: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async merge(repository: Repository, name: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async rebase(repository: Repository, name: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async show(repository: Repository, uri: string, options?: Git.Options.Show): Promise<string> {
        const encoding = options ? options.encoding || 'utf8' : 'utf8';
        const commitish = this.getCommitish(options);
        const path = await getFsPath(uri);
        if (encoding === 'binary') {
            return (await getBlobContents(repository.localUri, commitish, path)).toString();
        }
        return (await getTextContents(repository.localUri, commitish, path)).toString();
    }

    private getCommitish(options?: Git.Options.Show): string {
        if (options && options.commitish) {
            return 'index' === options.commitish ? '' : options.commitish;
        }
        return '';
    }

    private async getContainerRepository(path: string): Promise<Repository | undefined> {
        // Do not log an error if we are not contained in a Git repository. Treat exit code 128 as a success too.
        const options = { successExitCodes: new Set([0, 128]) };
        const result = await git(['rev-parse', '--show-toplevel'], path, 'rev-parse', options);
        const out = result.stdout;
        if (out.length) {
            const localUri = FileUri.fsPath(out.trim());
            return { localUri };
        }
        return undefined;
    }

}

async function mapStatus(toMap: IStatusResult, repository: Repository): Promise<WorkingDirectoryStatus> {
    const repositoryFsPath = await getFsPath(repository);
    const aheadBehindPromise = mapAheadBehind(toMap.branchAheadBehind);
    const changesPromise = mapFileChanges(toMap.workingDirectory, repositoryFsPath);
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

async function mapAheadBehind(toMap: IAheadBehind | undefined): Promise<{ ahead: number, behind: number } | undefined> {
    return toMap ? { ...toMap } : undefined;
}

async function mapFileChanges(toMap: DugiteStatus, repositoryFsPath: string): Promise<GitFileChange[]> {
    return Promise.all(toMap.files.map(file => mapFileChange(file, repositoryFsPath)));
}

async function mapFileChange(toMap: DugiteFileChange, repositoryFsPath: string): Promise<GitFileChange> {
    const uriPromise = getUri(Path.join(repositoryFsPath, toMap.path));
    const statusPromise = mapFileStatus(toMap.status);
    const oldUriPromise = toMap.oldPath ? await getUri(Path.join(repositoryFsPath, toMap.oldPath)) : undefined;
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

async function mapFileStatus(toMap: AppFileStatus): Promise<GitFileStatus> {
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

async function getFsPath(repository: Repository | string): Promise<string> {
    const uri = typeof repository === 'string' ? repository : repository.localUri;
    return FileUri.fsPath(uri);
}

async function getUri(path: string): Promise<string> {
    return FileUri.create(path).toString();
}
