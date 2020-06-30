/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { Resource, ResourceResolver, Emitter, Event, MaybePromise, DisposableCollection } from '@theia/core/lib/common';
import { UserStorageService } from './user-storage-service';
import { UserStorageUri } from './user-storage-uri';

export class UserStorageResource implements Resource {

    protected readonly onDidChangeContentsEmitter = new Emitter<void>();
    protected readonly toDispose = new DisposableCollection();
    constructor(
        public uri: URI,
        protected readonly service: UserStorageService
    ) {
        this.toDispose.push(this.service.onUserStorageChanged(e => {
            for (const changedUri of e.uris) {
                if (changedUri.toString() === this.uri.toString()) {
                    this.onDidChangeContentsEmitter.fire(undefined);
                }
            }
        }));

        this.toDispose.push(this.onDidChangeContentsEmitter);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    readContents(options?: { encoding?: string }): Promise<string> {
        return this.service.readContents(this.uri);
    }

    saveContents(content: string): Promise<void> {
        return this.service.saveContents(this.uri, content);
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
        if (uri.scheme !== UserStorageUri.SCHEME || !uri.path.isAbsolute) {
            throw new Error('The given uri is not a user storage uri: ' + uri);
        }
        return new UserStorageResource(uri, this.service);
    }

}
