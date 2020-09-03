/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { Resource, ResourceReadOptions, ResourceResolver, MaybePromise } from '@theia/core/lib/common';
import { Endpoint } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { PluginPackage } from '../../common';
import { injectable } from 'inversify';

export class PluginResource implements Resource {
    readonly uri: URI;

    constructor(pluginId: string, relativePath: string) {
        this.uri = PluginResource.getUri(pluginId, relativePath);
    }

    private static getUri(pluginId: string, relativePath: string): URI {
        return new Endpoint({
            path: `hostedPlugin/${pluginId}/${encodeURIComponent(relativePath.normalize().toString())}`
        }).getRestUrl();
    }

    async readContents(options?: ResourceReadOptions): Promise<string> {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();

            request.onreadystatechange = function (): void {
                if (this.readyState === XMLHttpRequest.DONE) {
                    if (this.status === 200) {
                        resolve(this.response);
                    } else {
                        reject(new Error('Could not fetch plugin resource'));
                    }
                }
            };

            request.open('GET', this.uri.toString(), true);
            request.send();
        });
    }

    dispose(): void {

    }
}

@injectable()
export class PluginResourceResolver implements ResourceResolver {
    resolve(uri: URI): MaybePromise<Resource> {
        if (uri.scheme !== PluginPackage.RESOURCE_SCHEME) {
            throw new Error('Not a plugin resource');
        }
        const pathAsString = uri.path.toString();
        const matches = new RegExp('/hostedPlugin/(.*)/(.*)').exec(pathAsString);
        if (!matches) {
            throw new Error('path does not match: ' + uri.toString());
        }
        return new PluginResource(matches[1], matches[2]);
    }
}
