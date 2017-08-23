/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import * as Path from 'path';
import { Git } from '../common/git';
import { git } from 'dugite-extra/lib/core/git';
import { injectable, inject } from "inversify";
import { FileUri } from '@theia/core/lib/node/file-uri';
import { getStatus } from 'dugite-extra/lib/command/status';
import { stage, unstage } from 'dugite-extra/lib/command/stage';
import { locateRepositories } from './git-repository-locator';
import { WorkspaceServer } from '@theia/workspace/lib/common/workspace-protocol';
import { Repository, RepositoryWithRemote, WorkingDirectoryStatus, FileChange, FileStatus } from '../common/model';
import { IStatusResult, IAheadBehind, AppFileStatus, WorkingDirectoryStatus as DugiteStatus, FileChange as DugiteFileChange } from 'dugite-extra/lib/model/status';

/**
 * `dugite-extra` based Git implementation.
 */
@injectable()
export class DugiteGit implements Git {

    constructor(
        @inject(WorkspaceServer) private readonly workspace: WorkspaceServer) {
    }

    async repositories(): Promise<Repository[]> {
        const workspaceRoot = await this.workspace.getRoot();
        const path = await getFsPath(workspaceRoot);
        const repositories = await locateRepositories(path);
        if (!repositories.length) {
            try {
                const result = await git(['rev-parse', '--show-toplevel'], await getFsPath(workspaceRoot), 'rev-parse');
                const out = result.stdout;
                if (out.length) {
                    const localUri = FileUri.fsPath(out.trim());
                    repositories.push({ localUri });
                }
            } catch (error) {
                // We are not in a Git repository.
            }
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
        return stage(repository.localUri, paths);
    }

    async rm(repository: Repository, uri: string | string[]): Promise<void> {
        const paths = (Array.isArray(uri) ? uri : [uri]).map(FileUri.fsPath);
        return unstage(repository.localUri, paths);
    }

    async branch(repository: Repository, type?: "current" | "local" | "remote" | "all"): Promise<undefined | string | string[]> {
        throw new Error("Method not implemented.");
    }

    async createBranch(repository: Repository, name: string, startPoint?: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async renameBranch(repository: Repository, name: string, newName: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async deleteBranch(repository: Repository, name: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async checkout(repository: Repository, name: string, localName?: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async commit(repository: Repository, message?: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async fetch(repository: RepositoryWithRemote): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async push(repository: RepositoryWithRemote): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async pull(repository: RepositoryWithRemote): Promise<void> {
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

}

async function mapStatus(toMap: IStatusResult, repository: Repository): Promise<WorkingDirectoryStatus> {
    const aheadBehindPromise = mapAheadBehind(toMap.branchAheadBehind);
    const changesPromise = mapFileChanges(toMap.workingDirectory, repository);
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

async function mapFileChanges(toMap: DugiteStatus, repository: Repository): Promise<FileChange[]> {
    return Promise.all(toMap.files.map(file => mapFileChange(file, repository)));
}

async function mapFileChange(toMap: DugiteFileChange, repository: Repository): Promise<FileChange> {
    const uriPromise = getUri(Path.join(repository.localUri, toMap.path));
    const statusPromise = mapFileStatus(toMap.status);
    const oldUriPromise = toMap.oldPath ? await getUri(Path.join(repository.localUri, toMap.oldPath)) : undefined;
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

async function mapFileStatus(toMap: AppFileStatus): Promise<FileStatus> {
    switch (toMap) {
        case AppFileStatus.Conflicted: return FileStatus.Conflicted;
        case AppFileStatus.Copied: return FileStatus.Copied;
        case AppFileStatus.Deleted: return FileStatus.Deleted;
        case AppFileStatus.Modified: return FileStatus.Modified;
        case AppFileStatus.New: return FileStatus.New;
        case AppFileStatus.Renamed: return FileStatus.Renamed;
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
