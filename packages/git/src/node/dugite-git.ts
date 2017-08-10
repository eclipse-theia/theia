/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import URI from '@theia/core/lib/common/uri';
import { status } from 'dugite-extra/lib/command';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { Git, Repository, WorkingDirectoryStatus, FileChange } from '../common';
import { IStatusResult, IAheadBehind, WorkingDirectoryStatus as DugiteStatus, FileChange as DugiteFileChange } from 'dugite-extra/lib/model';

/**
 * `dugite-extra` based Git implementation.
 */
export class DugiteGit implements Git {

    status(repository: Repository): Promise<WorkingDirectoryStatus> {
        const path = FileUri.fsPath(new URI(repository.localUri));
        return status(path).then(result => mapStatus(result, repository));
    }

}

function mapStatus(toMap: IStatusResult, repository: Repository): WorkingDirectoryStatus {
    return {
        exists: toMap.exists,
        branch: toMap.currentBranch,
        upstreamBranch: toMap.currentUpstreamBranch,
        aheadBehind: mapAheadBehind(toMap.branchAheadBehind),
        changes: mapFileChanges(toMap.workingDirectory, repository)
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
        uri: FileUri.create(path.join(repository.localUri, toMap.path)),
        status: toMap.status,
        oldUri: toMap.oldPath ? FileUri.create(toMap.oldPath) : undefined
    };
}
