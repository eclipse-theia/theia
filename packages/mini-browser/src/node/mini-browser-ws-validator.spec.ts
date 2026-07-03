// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { expect } from 'chai';
import * as http from 'http';
import { MiniBrowserWsRequestValidator } from './mini-browser-ws-validator';

describe('MiniBrowserWsRequestValidator', () => {

    function createValidator(): MiniBrowserWsRequestValidator {
        const validator = new MiniBrowserWsRequestValidator();
        // Uses the default host pattern '{{uuid}}.mini-browser.{{hostname}}'.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (validator as any)['init']();
        return validator;
    }

    function createRequest(origin?: string): http.IncomingMessage {
        const request = {
            headers: {} as http.IncomingHttpHeaders
        } as http.IncomingMessage;
        if (origin !== undefined) {
            request.headers.origin = origin;
        }
        return request;
    }

    it('should refuse WebSocket upgrades from the mini-browser virtual host', async () => {
        const validator = createValidator();
        expect(await validator.allowWsUpgrade(
            createRequest('http://abc.mini-browser.localhost:3000')
        )).to.be.false;
    });

    it('should allow WebSocket upgrades from other origins', async () => {
        const validator = createValidator();
        expect(await validator.allowWsUpgrade(
            createRequest('http://localhost:3000')
        )).to.be.true;
    });

    it('should allow requests with no Origin header', async () => {
        const validator = createValidator();
        expect(await validator.allowWsUpgrade(createRequest())).to.be.true;
    });

    it('should not throw and should allow when the Origin header is malformed', async () => {
        const validator = createValidator();
        expect(await validator.allowWsUpgrade(
            createRequest('not-a-valid-url')
        )).to.be.true;
    });
});
