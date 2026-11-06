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
import { Container } from 'inversify';
import { ConnectionHandler } from '../../common/messaging/handler.js';
import { ConnectionContainerModule } from './connection-container-module.js';

describe('ConnectionContainerModule', () => {

    it('declares frontend services independent of the shell environment, and backend services as told', () => {
        const BackendService = Symbol('BackendService');
        const module = ConnectionContainerModule.create(({ bind, bindFrontendService, bindBackendService }) => {
            bindFrontendService('/services/frontend', Symbol('FrontendService'));
            bind(BackendService).toConstantValue({});
            bindBackendService('/services/held', BackendService);
            bindBackendService('/services/independent', BackendService, undefined, { independentOfShellEnvironment: true });
        });
        const container = new Container();
        container.load(module);
        const independence = new Map(container.getAll<ConnectionHandler>(ConnectionHandler).map(handler => [handler.path, handler.independentOfShellEnvironment]));
        expect(independence.get('/services/frontend')).to.be.true;
        expect(independence.get('/services/held')).to.be.false;
        expect(independence.get('/services/independent')).to.be.true;
    });
});
