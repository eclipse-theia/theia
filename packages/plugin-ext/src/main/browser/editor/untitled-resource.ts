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

import { ResourceResolver, Resource } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { injectable } from 'inversify';
import { Schemes } from '../../../common/uri-components';

const resources = new Map<string, UntitledResource>();
let index = 0;
@injectable()
export class UntitledResourceResolver implements ResourceResolver {
    resolve(uri: URI): Resource | Promise<Resource> {
        if (uri.scheme === Schemes.UNTITLED) {
            return resources.get(uri.toString())!;
        }
        throw new Error(`scheme ${uri.scheme} is not '${Schemes.UNTITLED}'`);
    }
}

export class UntitledResource implements Resource {

    constructor(public uri: URI, private content?: string) {
        resources.set(this.uri.toString(), this);
    }

    readContents(options?: { encoding?: string | undefined; } | undefined): Promise<string> {
        return Promise.resolve(this.content ? this.content : '');
    }

    dispose(): void {
        resources.delete(this.uri.toString());
    }
}

export function createUntitledResource(content?: string, language?: string): UntitledResource {
    let extension;
    if (language) {
        for (const lang of monaco.languages.getLanguages()) {
            if (lang.id === language) {
                if (lang.extensions) {
                    extension = lang.extensions[0];
                    break;
                }
            }
        }
    }
    return new UntitledResource(new URI().withScheme(Schemes.UNTITLED).withPath(`/Untitled-${index++}${extension ? extension : ''}`), content);
}
