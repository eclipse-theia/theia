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
import { FileUri } from "@theia/core/lib/node/file-uri";

export const GIT_RESOURCE_SCHEME = 'gitrev';

export class GitResource implements Resource {

    constructor(readonly uri: URI, protected readonly repository: Repository, protected readonly git: Git) { }

    readContents(options?: { encoding?: string | undefined; } | undefined): Promise<string> {
        return this.git.show(this.repository, this.uri.toString(), Object.assign({
            commitish: this.uri.query
        }, options)).then(content => content.toString());
    }

    dispose(): void { }
}

@injectable()
export class GitResourceResolver implements ResourceResolver {

    protected repos: Repository[] = [];

    constructor(
        @inject(Git) protected readonly git: Git
    ) {
        this.git.repositories().then(r => {
            this.repos = r;
        });
    }

    resolve(uri: URI): Resource | Promise<Resource> {
        if (uri.scheme !== GIT_RESOURCE_SCHEME) {
            throw new Error("The given uri is not a git uri: " + uri);
        }
        return this.getResources(uri);
    }

    async getResources(uri: URI): Promise<GitResource> {
        const repository = await this.getRepository(uri);
        return new GitResource(uri, repository, this.git);
    }

    async getRepository(uri: URI): Promise<Repository> {
        const uriWoS = uri.withoutScheme();
        const dirStr = FileUri.fsPath(uriWoS);
        let localUri: URI;
        let localUriStr: string;
        if (this.repos.length === 0) {
            this.repos = await this.git.repositories();
        }
        for (const repo of this.repos) {
            localUri = new URI(repo.localUri);
            // make sure that localUri of repo has no scheme.
            localUriStr = localUri.withoutScheme().toString();
            if (dirStr.toString().endsWith(localUriStr)) {
                return { localUri: localUriStr };
            }
        }
        return this.getRepository(uri.parent);
    }
}
