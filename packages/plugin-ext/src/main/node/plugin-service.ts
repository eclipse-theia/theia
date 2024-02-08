// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as http from 'http';
import * as path from 'path';
import * as url from 'url';
const vhost = require('vhost');
import * as express from '@theia/core/shared/express';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { WebviewExternalEndpoint } from '../common/webview-protocol';
import { environment } from '@theia/core/shared/@theia/application-package/lib/environment';
import { WsRequestValidatorContribution } from '@theia/core/lib/node/ws-request-validators';
import { MaybePromise } from '@theia/core/lib/common';
import { ApplicationPackage } from '@theia/core/shared/@theia/application-package';
import { BackendRemoteService } from '@theia/core/lib/node/remote/backend-remote-service';

@injectable()
export class PluginApiContribution implements BackendApplicationContribution, WsRequestValidatorContribution {

    protected webviewExternalEndpointRegExp: RegExp;

    protected serveSameOrigin: boolean = false;

    @inject(ApplicationPackage)
    protected readonly applicationPackage: ApplicationPackage;

    @inject(BackendRemoteService)
    protected readonly remoteService: BackendRemoteService;

    @postConstruct()
    protected init(): void {
        const webviewExternalEndpoint = this.webviewExternalEndpoint();
        console.log(`Configuring to accept webviews on '${webviewExternalEndpoint}' hostname.`);
        this.webviewExternalEndpointRegExp = new RegExp(webviewExternalEndpoint, 'i');
    }

    configure(app: express.Application): void {
        const webviewApp = express();
        webviewApp.use('/webview', express.static(path.join(this.applicationPackage.projectPath, 'lib', 'webview', 'pre')));
        if (this.remoteService.isRemoteServer()) {
            // Any request to `subdomain.localhost:port/webview/...` will get redirected to the remote system.
            // However, it will get redirected directly to the `localhost:remotePort` address, losing the subdomain info.
            // In this case, we simply serve the webviews on a path.
            app.use(webviewApp);
        } else {
            app.use(vhost(this.webviewExternalEndpointRegExp, webviewApp));
        }
    }

    allowWsUpgrade(request: http.IncomingMessage): MaybePromise<boolean> {
        if (request.headers.origin && !this.serveSameOrigin) {
            const origin = url.parse(request.headers.origin);
            if (origin.host && this.webviewExternalEndpointRegExp.test(origin.host)) {
                // If the origin comes from the WebViews, refuse:
                return false;
            }
        }
        return true;
    }

    protected webviewExternalEndpointPattern(): string {
        let endpointPattern;
        if (environment.electron.is()) {
            endpointPattern = WebviewExternalEndpoint.defaultPattern;
        } else {
            endpointPattern = process.env[WebviewExternalEndpoint.pattern] || WebviewExternalEndpoint.defaultPattern;
        }
        if (endpointPattern === '{{hostname}}') {
            this.serveSameOrigin = true;
        }
        return endpointPattern;
    }

    /**
     * Returns a RegExp pattern matching the expected WebView endpoint's host.
     */
    protected webviewExternalEndpoint(): string {
        return `^${this.webviewExternalEndpointPattern()
            .replace(/\./g, '\\.')
            .replace('{{uuid}}', '.+')
            .replace('{{hostname}}', '.+')}$`;
    }
}
