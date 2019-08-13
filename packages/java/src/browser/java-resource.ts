/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import { Resource, ResourceResolver } from '@theia/core/lib/common';
import { JAVA_SCHEME } from '../common';
import { ClassFileContentsRequest } from './java-protocol';
import { JavaClientContribution } from './java-client-contribution';

export class JavaResource implements Resource {

    constructor(
        public uri: URI,
        protected readonly clientContribution: JavaClientContribution
    ) { }

    dispose(): void {
    }

    readContents(options: { encoding?: string }): Promise<string> {
        const uri = this.uri.toString();
        return this.clientContribution.languageClient.then(languageClient =>
            languageClient.sendRequest(ClassFileContentsRequest.type.method, { uri }).then((content: string) =>
                content || ''
            )
        );
    }

}

@injectable()
export class JavaResourceResolver implements ResourceResolver {

    constructor(
        @inject(JavaClientContribution)
        protected readonly clientContribution: JavaClientContribution
    ) { }

    resolve(uri: URI): JavaResource {
        if (uri.scheme !== JAVA_SCHEME) {
            throw new Error('The given URI is not a valid Java uri: ' + uri);
        }
        return new JavaResource(uri, this.clientContribution);
    }

}
