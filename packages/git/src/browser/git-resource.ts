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
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

export const GIT_RESOURCE_SCHEME = 'gitrev';

export class GitResource implements Resource {

    constructor(readonly uri: URI, protected readonly repository: Repository, protected readonly git: Git) { }

    async readContents(options?: { encoding?: string | undefined; } | undefined): Promise<string> {
        return await this.git.show(this.repository, this.uri.toString(), Object.assign({ commitish: this.uri.query }, options));
    }

    dispose(): void { }
}

@injectable()
export class GitResourceResolver implements ResourceResolver {

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService
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

    async getRepository(uri: URI): Promise<Repository> {
        const root = await this.workspaceService.root;
        const uriWithoutScheme = uri.withoutScheme();
        const repos = await this.git.repositories(root.uri);
        // We sort by length so that we visit the nested repositories first.
        // We do not want to get the repository A instead of B if we have:
        // repository A, another repository B inside A and a resource A/B/C.ext.
        const sortedRepos = repos.sort((a, b) => b.localUri.length - a.localUri.length);
        for (const repo of sortedRepos) {
            const localUri = new URI(repo.localUri);
            // make sure that localUri of repo has no scheme.
            const localUriStr = localUri.withoutScheme().toString();
            if (uriWithoutScheme.toString().startsWith(localUriStr)) {
                return { localUri: localUriStr };
            }
        }
        return repos[0];
    }
}