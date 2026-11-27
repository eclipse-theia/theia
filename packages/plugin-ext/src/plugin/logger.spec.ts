// *****************************************************************************
// Copyright (C) 2026 JuliaHub, Inc. and others.
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
import { RPCProtocol } from '../common/rpc-protocol.js';
import { PluginLogger } from './logger.js';

describe('PluginLogger', () => {

    // The plugin host reports unhandled rejections through `console.error`, which it routes back
    // through this logger, so an unhandled `$log` rejection would log itself without bound.
    it('should not leave an unhandled rejection when the main side cannot log', async () => {
        const rpc = { getProxy: () => ({ $log: () => Promise.reject(new Error('main side is gone')) }) } as unknown as RPCProtocol;
        const logger = new PluginLogger(rpc, 'plugin-host');

        const rejections: unknown[] = [];
        const onRejection = (reason: unknown) => rejections.push(reason);
        process.on('unhandledRejection', onRejection);
        try {
            logger.error('a log the main side will refuse');
            await new Promise(resolve => setImmediate(resolve));
        } finally {
            process.off('unhandledRejection', onRejection);
        }

        expect(rejections, `unexpected unhandled rejections: ${rejections}`).to.be.empty;
    });
});
