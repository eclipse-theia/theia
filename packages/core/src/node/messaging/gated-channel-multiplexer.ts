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

import { Channel, ChannelMultiplexer } from '../../common/message-rpc/channel.js';

/**
 * A channel multiplexer that can defer the acknowledgement of a channel that the other side opens until a gate opens.
 * The other side sends nothing on a channel before the acknowledgement, so nothing is lost while the channel is held.
 *
 * The backend holds the service channels of a frontend until the `PATH` of the user's login shell has been
 * applied to `process.env`, so that the services find the user's tools,
 * see `ShellEnvironmentServer` and `ConnectionHandler.independentOfShellEnvironment`.
 */
export class GatedChannelMultiplexer extends ChannelMultiplexer {

    /**
     * @param underlyingChannel the channel on which the channels are multiplexed
     * @param gate tells how long to hold the channel of a given id before acknowledging it,
     *   or `undefined` to acknowledge it at once. The channel is acknowledged whether the promise resolves or rejects.
     */
    constructor(underlyingChannel: Channel, protected readonly gate: (id: string) => Promise<void> | undefined) {
        super(underlyingChannel);
    }

    protected override handleOpen(id: string): void {
        const hold = this.gate(id);
        if (!hold) {
            super.handleOpen(id);
            return;
        }
        const open = (): void => {
            // the connection may have been closed while the channel was held
            if (!this.toDispose.disposed) {
                super.handleOpen(id);
            }
        };
        hold.then(open, open);
    }
}
