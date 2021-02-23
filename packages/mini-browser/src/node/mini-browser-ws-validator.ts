/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { WsRequestValidatorContribution } from '@theia/core/lib/node/ws-request-validators';
import * as http from 'http';
import { injectable, postConstruct } from '@theia/core/shared/inversify';
import * as url from 'url';
import { MiniBrowserEndpoint } from '../common/mini-browser-endpoint';

/**
 * Prevents explicit WebSocket connections from the mini-browser virtual host.
 */
@injectable()
export class MiniBrowserWsRequestValidator implements WsRequestValidatorContribution {

    protected miniBrowserHostRe: RegExp;

    protected serveSameOrigin: boolean = false;

    @postConstruct()
    protected postConstruct(): void {
        const pattern = process.env[MiniBrowserEndpoint.HOST_PATTERN_ENV] || MiniBrowserEndpoint.HOST_PATTERN_DEFAULT;
        if (pattern === '{{hostname}}') {
            this.serveSameOrigin = true;
        }
        const vhostRe = pattern
            .replace(/\./g, '\\.')
            .replace('{{uuid}}', '.+')
            .replace('{{hostname}}', '.+');
        this.miniBrowserHostRe = new RegExp(vhostRe, 'i');
    }

    async allowWsUpgrade(request: http.IncomingMessage): Promise<boolean> {
        if (request.headers.origin && !this.serveSameOrigin) {
            const origin = url.parse(request.headers.origin);
            if (origin.host && this.miniBrowserHostRe.test(origin.host)) {
                // If the origin comes from the WebViews, refuse:
                return false;
            }
        }
        return true;
    }
}
