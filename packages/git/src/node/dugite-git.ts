/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as Path from 'path';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { createCommit, status } from 'dugite-extra/lib/command/';
import { stageFiles } from 'dugite-extra/lib/command/update-index';
import { Git } from '../common/git';
import { git } from 'dugite-extra/lib/util/git';
import { Repository, WorkingDirectoryStatus, FileChange } from '../common/model';
import { IStatusResult, IAheadBehind, WorkingDirectoryStatus as DugiteStatus, FileChange as DugiteFileChange } from 'dugite-extra/lib/model';

/**
 * `dugite-extra` based Git implementation.
 */
export class DugiteGit implements Git {

    private pollInterval: number;
    private readonly pollers: Map<Repository, NodeJS.Timer>;
    private readonly listeners: Map<Repository, ((status: WorkingDirectoryStatus) => void)[]>;
    private readonly lastStatus: Map<Repository, WorkingDirectoryStatus>;

    constructor() {
        this.pollInterval = 1000; // TODO use preferences for polling time.
        this.pollers = new Map();
        this.listeners = new Map();
        this.lastStatus = new Map();
    }

    status(repository: Repository): Promise<WorkingDirectoryStatus> {
        const repositoryPath = FileUri.fsPath(new URI(repository.localUri))
        return status(repositoryPath).then(result => mapStatus(result, repository));
    }

    stage(repository: Repository, file: string | string[]): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const repositoryPath = FileUri.fsPath(new URI(repository.localUri));
                const result = await status(repositoryPath);
                const filesToStage = [];
                const files = (Array.isArray(file) ? file : [file]).map(f => new URI(f)).map(FileUri.fsPath);
                for (const f of result.workingDirectory.files) {
                    const path = Path.join(repositoryPath, f.path);
                    // TODO handle deleted and moved files.
                    const index = files.indexOf(path);
                    if (index !== -1) {
                        files.splice(index, 1);
                        filesToStage.push(f);
                    }
                }
                if (files.length !== 0) {
                    return reject(new Error(`The following files cannot be staged because those do not exist in the working directory as changed files: ${files}`));
                }
                await stageFiles(repositoryPath, filesToStage);
                return resolve();
            } catch (error) {
                return reject(error);
            }
        });
    }

    unstage(repository: Repository, file: string | string[]): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const repositoryPath = FileUri.fsPath(new URI(repository.localUri));
                const result = await this.getStagedFiles(repositoryPath);
                const filesToUnstage = [];
                const files = (Array.isArray(file) ? file : [file]).map(f => new URI(f)).map(FileUri.fsPath).map(f => Path.relative(repositoryPath, f));
                for (const f of result) {
                    // TODO handle deleted and moved files.
                    const index = files.indexOf(f);
                    if (index !== -1) {
                        files.splice(index, 1);
                        filesToUnstage.push(f);
                    }
                }
                if (files.length !== 0) {
                    return reject(new Error(`The following files cannot be unstaged because those do not exist in the working directory as changed files: ${files}`));
                }
                await this.unstageFiles(repositoryPath, filesToUnstage);
                return resolve();
            } catch (error) {
                return reject(error);
            }
        });
    }

    stagedFiles(repository: Repository): Promise<FileChange[]> {
        return new Promise(async (resolve, reject) => {
            const repositoryPath = FileUri.fsPath(new URI(repository.localUri));
            const statusPromise = status(repositoryPath);
            const stagedFileNamesPromise = this.getStagedFiles(repositoryPath);
            const statusResult = await statusPromise;
            const stagedFileNames = await stagedFileNamesPromise;
            return resolve(statusResult.workingDirectory.files.filter(f => stagedFileNames.indexOf(f.path) !== -1).map(f => mapFileChange(f, repository)));
        });
    }

    commit(repository: Repository, message: string): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            try {
                const repositoryPath = FileUri.fsPath(new URI(repository.localUri));
                const statusPromise = status(repositoryPath);
                const stagedFilesPromise = this.getStagedFiles(repositoryPath);
                const statusResult = await statusPromise;
                const stagedFilesResult = await stagedFilesPromise;
                const filesToCommit = [];
                for (const f of statusResult.workingDirectory.files) {
                    if (stagedFilesResult.indexOf(f.path) !== -1) {
                        filesToCommit.push(f);
                    }
                }
                const commitResult = await createCommit(repositoryPath, message, filesToCommit);
                return resolve(commitResult);
            } catch (error) {
                return reject(error);
            }
        });
    }

    on(event: "statusChange", repository: Repository, listener: (status: WorkingDirectoryStatus) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            const key = [...this.listeners.keys()].find(r => Repository.equals(repository, r)) || repository;
            let listeners = this.listeners.get(key);
            if (!listeners) {
                listeners = [];
                this.listeners.set(key, listeners);
            }
            if (listeners.indexOf(listener) !== -1) {
                return resolve();
            }
            if (!this.pollers.has(key)) {
                const poller = setInterval(async () => {
                    const newStatus = await this.status(key);
                    const oldStatus = this.lastStatus.get(key);
                    // Send the change event, only if the status has changed.
                    if (!WorkingDirectoryStatus.equals(oldStatus, newStatus)) {
                        this.lastStatus.set(key, newStatus);
                        listeners!.forEach(listener => listener(newStatus));
                    }
                }, this.pollInterval);
                this.pollers.set(key, poller);
            }
            listeners.push(listener);
            return resolve();
        });
    }

    off(event: "statusChange", repository: Repository, listener: (status: WorkingDirectoryStatus) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            const key = [...this.listeners.keys()].find(r => Repository.equals(repository, r)) || repository;
            const listeners = this.listeners.get(key);
            if (!listeners) {
                return resolve();
            }
            const index = listeners.indexOf(listener);
            if (index !== -1) {
                listeners.splice(index, 1);
                if (listeners.length === 0) {
                    this.listeners.delete(repository);
                    const poller = this.pollers.get(repository);
                    if (poller) {
                        clearTimeout(poller);
                    }
                    this.pollers.delete(repository);
                    this.lastStatus.delete(repository);
                }
            }
            return resolve();
        });
    }

    private getStagedFiles(repositoryPath: string): Promise<string[]> {
        return new Promise(async (resolve, reject) => {
            const result = await git(['diff', '--name-only', '--cached'], repositoryPath, 'diff');
            if (result.exitCode !== 0) {
                return reject(new Error(result.stderr));
            }
            return resolve(result.stdout.split('\n').filter(s => s.length > 0));
        });
    }

    private unstageFiles(repositoryPath: string, filePath: string | string[]): Promise<void> {
        return new Promise(async (resolve, reject) => {
            const stagedFiles = await this.getStagedFiles(repositoryPath);

            const result = await git(['reset', 'HEAD'], repositoryPath, 'diff', {
                stdin: stagedFiles.join('\0')
            });
            if (result.exitCode !== 0) {
                return reject(new Error(result.stderr));
            }
            return resolve();
        });
    }

}

function mapStatus(toMap: IStatusResult, repository: Repository): WorkingDirectoryStatus {
    return {
        exists: toMap.exists,
        branch: toMap.currentBranch,
        upstreamBranch: toMap.currentUpstreamBranch,
        aheadBehind: mapAheadBehind(toMap.branchAheadBehind),
        changes: mapFileChanges(toMap.workingDirectory, repository),
        currentHead: toMap.currentTip
    };
}

function mapAheadBehind(toMap: IAheadBehind | undefined): { ahead: number, behind: number } | undefined {
    return toMap ? { ...toMap } : undefined;
}

function mapFileChanges(toMap: DugiteStatus, repository: Repository): FileChange[] {
    return toMap.files.map(file => mapFileChange(file, repository));
}

function mapFileChange(toMap: DugiteFileChange, repository: Repository): FileChange {
    return {
        uri: FileUri.create(Path.join(repository.localUri, toMap.path)),
        status: toMap.status,
        oldUri: toMap.oldPath ? FileUri.create(Path.join(repository.localUri, toMap.oldPath)) : undefined
    };
}
