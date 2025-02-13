// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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

import { LogLevel } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { PluginLogger } from '../../plugin/logger';
import { format } from 'util';

export function setupPluginHostLogger(rpc: RPCProtocol): void {
    const logger = new PluginLogger(rpc, 'plugin-host');

    function createLog(level: LogLevel): typeof console.log {
        return (message, ...params) => {
            // Format the messages beforehand
            // This ensures that we don't accidentally send objects that are not serializable
            const formatted = format(message, ...params);
            logger.log(level, formatted);
        };
    }

    console.log = console.info = createLog(LogLevel.Info);
    console.debug = createLog(LogLevel.Debug);
    console.warn = createLog(LogLevel.Warn);
    console.error = createLog(LogLevel.Error);
    console.trace = createLog(LogLevel.Trace);
}
