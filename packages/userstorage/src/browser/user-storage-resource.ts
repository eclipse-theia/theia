/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { Resource, ResourceResolver, Emitter, Event, MaybePromise, DisposableCollection } from '@theia/core/lib/common';
import { UserStorageService } from './user-storage-service';
import { UserStorageUri } from './user-storage-uri';

export class UserStorageResource implements Resource {

    protected readonly onDidChangeContentsEmitter = new Emitter<void>();
    protected readonly toDispose = new DisposableCollection();
    private readonly _uri: string;

    constructor(
        public uri: URI,
        protected readonly service: UserStorageService
    ) {

        this._uri = uri.toString();

        this.toDispose.push(this.service.onUserStorageChanged(e => {
            for (const changedUri of e.uris) {
                if (changedUri === this._uri) {
                    this.onDidChangeContentsEmitter.fire(undefined);
                }
            }
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    readContents(options?: { encoding?: string }): Promise<string> {
        return this.service.readContents(this._uri);
    }

    saveContents(content: string): Promise<void> {
        return this.service.saveContents(this._uri, content);
    }

    get onDidChangeContents(): Event<void> {
        return this.onDidChangeContentsEmitter.event;
    }
}

@injectable()
export class UserStorageResolver implements ResourceResolver {

    constructor(
        @inject(UserStorageService) protected readonly service: UserStorageService

    ) { }

    resolve(uri: URI): MaybePromise<UserStorageResource> {
        if (uri.scheme !== UserStorageUri.SCHEME) {
            throw new Error('The given uri is not a user storage uri: ' + uri);
        }
        return new UserStorageResource(uri, this.service);
    }

}
