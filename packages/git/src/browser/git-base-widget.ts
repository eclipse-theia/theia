/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { VirtualWidget } from "@theia/core/lib/browser";
import { GitFileStatus, Repository } from '../common';
import URI from "@theia/core/lib/common/uri";

export class GitBaseWidget extends VirtualWidget {

    protected getStatusCaption(status: GitFileStatus, staged: boolean): string {
        switch (status) {
            case GitFileStatus.New: return staged ? 'Added' : 'Unstaged';
            case GitFileStatus.Renamed: return 'Renamed';
            case GitFileStatus.Copied: return 'Copied';
            case GitFileStatus.Modified: return 'Modified';
            case GitFileStatus.Deleted: return 'Deleted';
            case GitFileStatus.Conflicted: return 'Conficted';
        }
        return '';
    }

    /**
     * Returns the repository relative path of the given uri.
     * @param repository
     * @param uri
     */
    protected getRepositoryRelativePath(repository: Repository, uri: URI) {
        const repositoryUri = new URI(repository.localUri);
        return uri.toString().substr(repositoryUri.toString().length + 1);
    }
}
