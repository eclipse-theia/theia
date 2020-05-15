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

import * as path from 'path';
import connect = require('connect');
import serveStatic = require('serve-static');
const vhost = require('vhost');
import * as express from 'express';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { injectable } from 'inversify';
import { WebviewExternalEndpoint } from '../common/webview-protocol';
import { environment } from '@theia/application-package/lib/environment';

const pluginPath = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + './theia/plugins/';

@injectable()
export class PluginApiContribution implements BackendApplicationContribution {

    configure(app: express.Application): void {
        app.get('/plugin/:path(*)', (req, res) => {
            const filePath: string = req.params.path;
            res.sendFile(pluginPath + filePath);
        });

        const webviewApp = connect();
        webviewApp.use('/webview', serveStatic(path.join(__dirname, '../../../src/main/browser/webview/pre')));
        const webviewExternalEndpoint = this.webviewExternalEndpoint();
        console.log(`Configuring to accept webviews on '${webviewExternalEndpoint}' hostname.`);
        app.use(vhost(new RegExp(webviewExternalEndpoint, 'i'), webviewApp));
    }

    protected webviewExternalEndpoint(): string {
        let endpointPattern;
        if (environment.electron.is()) {
            endpointPattern = WebviewExternalEndpoint.defaultPattern;
        } else {
            endpointPattern = process.env[WebviewExternalEndpoint.pattern] || WebviewExternalEndpoint.defaultPattern;
        }
        return endpointPattern
            .replace('{{uuid}}', '.+')
            .replace('{{hostname}}', '.+');
    }
}
