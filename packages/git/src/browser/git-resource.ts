/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable, inject } from "inversify";
import { Git, Repository } from '../common';
import { Resource, ResourceResolver, DisposableCollection } from "@theia/core";
import URI from "@theia/core/lib/common/uri";

export const GIT_RESOURCE_SCHEME = 'gitrev';

export class GitResource implements Resource {

    protected readonly toDispose = new DisposableCollection();

    constructor(readonly uri: URI, protected readonly repository: Repository, protected readonly git: Git) { }

    readContents(options?: { encoding?: string | undefined; } | undefined): Promise<string> {
        return this.git.show(this.repository, this.uri.toString(), Object.assign({
            commitish: this.uri.query
        }, options)).then(content => content.toString());
    }

    dispose(): void {
        this.toDispose.dispose();
    }
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
        return Promise.resolve(new GitResource(uri, repository, this.git));
    }

    async getRepository(uri: URI): Promise<Repository> {
        const uriWoS = uri.withoutScheme();
        const dir = uriWoS.path.dir;
        const dirStr = dir.toString();
        let localUri: URI;
        let localUriStr: string;
        if (this.repos.length === 0) {
            this.repos = await this.git.repositories();
        }
        for (let idx = 0; idx < this.repos.length; idx++) {
            localUri = new URI(this.repos[idx].localUri);
            // make sure that localUri of repo has no scheme.
            localUriStr = localUri.withoutScheme().toString();
            if (dirStr.toString().endsWith(localUriStr)) {
                return Promise.resolve({ localUri: localUriStr });
            }
        }
        return this.getRepository(uri.parent);
    }
}
