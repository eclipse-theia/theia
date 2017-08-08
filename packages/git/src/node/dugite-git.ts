/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from '@theia/core/lib/common/uri';
import { status } from 'dugite-extra/lib/command';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { Git, Repository, WorkingDirectoryStatus, FileChange, FileStatus } from '../common';
import { IStatusResult, IAheadBehind, WorkingDirectoryStatus as DugiteStatus, FileChange as DugiteFileChange } from 'dugite-extra/lib/model';

/**
 * `dugite-extra` based Git implementation.
 */
export class DugiteGit implements Git {

    status(repository: Repository): Promise<WorkingDirectoryStatus> {
        const path = FileUri.fsPath(new URI(repository.localUri));
        return status(path).then(result => mapStatus(result));
    }

}

function mapStatus(toMap: IStatusResult): WorkingDirectoryStatus {
    return {
        exists: toMap.exists,
        branch: toMap.currentBranch,
        upstreamBranch: toMap.currentUpstreamBranch,
        aheadBehind: mapAheadBehind(toMap.branchAheadBehind),
        changes: mapFileChanges(toMap.workingDirectory)
    };
}

function mapAheadBehind(toMap: IAheadBehind | undefined): { ahead: number, behind: number } | undefined {
    return toMap ? { ...toMap } : undefined;
}

function mapFileChanges(toMap: DugiteStatus): FileChange[] {
    return toMap.files.map(mapFileChange);
}

function mapFileChange(toMap: DugiteFileChange): FileChange {
    return {
        uri: FileUri.create(toMap.path),
        status: FileStatus.Conflicted,
        oldUri: toMap.oldPath ? FileUri.create(toMap.oldPath) : undefined
    };
}
