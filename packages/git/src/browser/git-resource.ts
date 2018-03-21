/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Git, Repository } from '../common';
import { Resource, ResourceResolver } from "@theia/core";
import URI from "@theia/core/lib/common/uri";
import { GitRepositoryProvider } from './git-repository-provider';

export const GIT_RESOURCE_SCHEME = 'gitrev';

export class GitResource implements Resource {

    constructor(readonly uri: URI, protected readonly repository: Repository | undefined, protected readonly git: Git) { }

    async readContents(options?: { encoding?: string }): Promise<string> {
        if (this.repository) {
            const commitish = this.uri.query;
            return this.git.show(this.repository, this.uri.toString(), Object.assign({ commitish }, options));
        }
        return '';
    }

    dispose(): void { }
}

@injectable()
export class GitResourceResolver implements ResourceResolver {

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider
    ) { }

    resolve(uri: URI): Resource | Promise<Resource> {
        if (uri.scheme !== GIT_RESOURCE_SCHEME) {
            throw new Error(`Expected a URI with ${GIT_RESOURCE_SCHEME} scheme. Was: ${uri}.`);
        }
        return this.getResource(uri);
    }

    async getResource(uri: URI): Promise<GitResource> {
        const repository = await this.getRepository(uri);
        return new GitResource(uri, repository, this.git);
    }

    async getRepository(uri: URI): Promise<Repository | undefined> {
        const uriWithoutScheme = uri.withoutScheme();
        const repositories = this.repositoryProvider.allRepositories;
        // The layout restorer might ask for the known repositories this point.
        if (repositories.length === 0) {
            // So let's make sure, the repository provider state is in sync with the backend.
            await this.repositoryProvider.refresh();
            repositories.push(...this.repositoryProvider.allRepositories);
        }
        // We sort by length so that we visit the nested repositories first.
        // We do not want to get the repository A instead of B if we have:
        // repository A, another repository B inside A and a resource A/B/C.ext.
        const sortedRepositories = repositories.sort((a, b) => b.localUri.length - a.localUri.length);
        for (const repository of sortedRepositories) {
            const localUri = new URI(repository.localUri);
            // make sure that localUri of repository has no scheme.
            const localUriStr = localUri.withoutScheme().toString();
            if (uriWithoutScheme.toString().startsWith(localUriStr)) {
                return { localUri: localUriStr };
            }
        }
        return undefined;
    }
}
