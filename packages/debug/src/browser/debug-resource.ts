/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { Resource, ResourceResolver } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { DebugSessionManager } from './debug-session-manager';
import { DebugSource } from './model/debug-source';

export class DebugResource implements Resource {

    constructor(
        public uri: URI,
        protected readonly manager: DebugSessionManager
    ) { }

    dispose(): void { }

    async readContents(): Promise<string> {
        const { currentSession } = this.manager;
        if (!currentSession) {
            throw new Error(`There is no active debug session to load content '${this.uri}'`);
        }
        const source = await currentSession.toSource(this.uri);
        if (!source) {
            throw new Error(`There is no source for '${this.uri}'`);
        }
        return source.load();
    }

}

@injectable()
export class DebugResourceResolver implements ResourceResolver {

    @inject(DebugSessionManager)
    protected readonly manager: DebugSessionManager;

    resolve(uri: URI): DebugResource {
        if (uri.scheme !== DebugSource.SCHEME) {
            throw new Error('The given URI is not a valid debug URI: ' + uri);
        }
        return new DebugResource(uri, this.manager);
    }

}
