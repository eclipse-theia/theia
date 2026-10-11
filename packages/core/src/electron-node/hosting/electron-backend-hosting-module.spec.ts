// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { Container } from 'inversify';
import electronBackendHostingModule from './electron-backend-hosting-module';
import { HttpConnectionValidator } from '../../node/hosting/browser-connection-token';

describe('electron-backend-hosting-module', () => {

    it('should bind a no-op HttpConnectionValidator that calls next() unconditionally', () => {
        const container = new Container();
        container.load(electronBackendHostingModule);
        const validator = container.get<HttpConnectionValidator>(HttpConnectionValidator);

        let nextCalled = false;
        let sentStatus: number | undefined;
        // No cookie provided: the no-op validator must still call next() and never send a status.
        const req = { headers: {} as Record<string, string | undefined> };
        const res = { sendStatus: (status: number) => { sentStatus = status; } };
        const next = (): void => { nextCalled = true; };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        validator.validateRequest(req as any, res as any, next as any);

        expect(nextCalled).to.be.true;
        expect(sentStatus).to.be.undefined;
    });
});
