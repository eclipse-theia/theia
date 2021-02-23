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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import URI from '@theia/core/lib/common/uri';
import { WebviewExternalEndpoint } from '../../common/webview-protocol';
import { environment } from '@theia/core/shared/@theia/application-package/lib/environment';

@injectable()
export class WebviewEnvironment {

    @inject(EnvVariablesServer)
    protected readonly environments: EnvVariablesServer;

    protected readonly externalEndpointHost = new Deferred<string>();

    @postConstruct()
    protected async init(): Promise<void> {
        try {
            let endpointPattern;
            if (environment.electron.is()) {
                endpointPattern = WebviewExternalEndpoint.defaultPattern;
            } else {
                const variable = await this.environments.getValue(WebviewExternalEndpoint.pattern);
                endpointPattern = variable && variable.value || WebviewExternalEndpoint.defaultPattern;
            }
            const { host } = new Endpoint();
            this.externalEndpointHost.resolve(endpointPattern.replace('{{hostname}}', host));
        } catch (e) {
            this.externalEndpointHost.reject(e);
        }
    }

    async externalEndpointUrl(): Promise<URI> {
        const host = await this.externalEndpointHost.promise;
        return new Endpoint({
            host,
            path: '/webview'
        }).getRestUrl();
    }

    async externalEndpoint(): Promise<string> {
        return (await this.externalEndpointUrl()).toString(true);
    }

    async resourceRoot(): Promise<string> {
        return (await this.externalEndpointUrl()).resolve('theia-resource/{{resource}}').toString(true);
    }

    async cspSource(): Promise<string> {
        return (await this.externalEndpointUrl()).withPath('').withQuery('').withFragment('').toString(true).replace('{{uuid}}', '*');
    }

}
