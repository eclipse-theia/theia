/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { VirtualWidget } from "@theia/core/lib/browser";
import { GitFileStatus, Repository, GitFileChange } from '../common';
import URI from "@theia/core/lib/common/uri";
import { GitRepositoryProvider } from "./git-repository-provider";
import { LabelProvider } from "@theia/core/lib/browser/label-provider";

export class GitBaseWidget extends VirtualWidget {

    constructor(
        protected readonly repositoryProvider: GitRepositoryProvider,
        protected readonly labelProvider: LabelProvider) {
        super();
    }

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

    protected getRepositoryRelativePath(repository: Repository, uri: URI) {
        const repositoryUri = new URI(repository.localUri);
        return uri.toString().substr(repositoryUri.toString().length + 1);
    }

    protected relativePath(uri: URI | string): string {
        const parsedUri = typeof uri === 'string' ? new URI(uri) : uri;
        const repo = this.repositoryProvider.selectedRepository;
        if (repo) {
            return this.getRepositoryRelativePath(repo, parsedUri);
        } else {
            return this.labelProvider.getLongName(parsedUri);
        }
    }

    protected computeCaption(fileChange: GitFileChange): string {
        let result = `${this.relativePath(fileChange.uri)} - ${this.getStatusCaption(fileChange.status, true)}`;
        if (fileChange.oldUri) {
            result = `${this.relativePath(fileChange.oldUri)} -> ${result}`;
        }
        return result;
    }
}
