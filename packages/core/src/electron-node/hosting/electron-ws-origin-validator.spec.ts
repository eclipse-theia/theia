// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import { ElectronWsOriginValidator } from './electron-ws-origin-validator';
import { BackendRemoteService } from '../../node/remote/backend-remote-service';

describe('ElectronWsOriginValidator', () => {

    function createValidator(isRemote = false): ElectronWsOriginValidator {
        const remoteService = { isRemoteServer: () => isRemote } as BackendRemoteService;
        const validator = new ElectronWsOriginValidator();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (validator as any)['backendRemoteService'] = remoteService;
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

    it('should allow file:// origin (standard Electron case)', () => {
        expect(createValidator().allowWsUpgrade(createRequest('file://'))).to.be.true;
    });

    it('should allow null origin (opaque origin from file:// pages)', () => {
        expect(createValidator().allowWsUpgrade(createRequest('null'))).to.be.true;
    });

    it('should allow absent origin (same-origin polling requests)', () => {
        expect(createValidator().allowWsUpgrade(createRequest(undefined))).to.be.true;
    });

    it('should reject cross-origin requests', () => {
        expect(createValidator().allowWsUpgrade(createRequest('http://evil.com'))).to.be.false;
    });

    it('should reject http://localhost origin (not expected in Electron)', () => {
        expect(createValidator().allowWsUpgrade(createRequest('http://localhost:3000'))).to.be.false;
    });

    it('should allow empty string origin (treated as absent)', () => {
        expect(createValidator().allowWsUpgrade(createRequest(''))).to.be.true;
    });

    it('should allow any origin when running as remote server', () => {
        expect(createValidator(true).allowWsUpgrade(createRequest('http://remote-host.com'))).to.be.true;
    });
});
