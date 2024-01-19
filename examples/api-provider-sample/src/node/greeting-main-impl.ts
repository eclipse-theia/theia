// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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

import { generateUuid } from '@theia/core/lib/common/uuid';
import { RPCProtocol } from '@theia/plugin-ext/lib/common/rpc-protocol';
import { inject, injectable } from '@theia/core/shared/inversify';
import { GreetingKind, GreeterData, GreetingExt, GreetingMain, MAIN_RPC_CONTEXT } from '../common/plugin-api-rpc';

const GREETINGS = {
    [GreetingKind.DIRECT]: ['Hello, world!', "I'm here!", 'Good day!'],
    [GreetingKind.QUIRKY]: ['Howdy doody, world?', "What's crack-a-lackin'?", 'Wazzup werld?'],
    [GreetingKind.SNARKY]: ["Oh, it's you, world.", 'You again, world?!', 'Whatever.'],
} as const;

@injectable()
export class GreetingMainImpl implements GreetingMain {
    protected proxy: GreetingExt;

    private greeterData: Record<string, GreeterData> = {};

    constructor(@inject(RPCProtocol) rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.GREETING_EXT);
    }

    async $createGreeter(): Promise<GreeterData> {
        const result: GreeterData = {
            uuid: generateUuid(),
            greetingKinds: [GreetingKind.DIRECT]
        };
        this.greeterData[result.uuid] = result;
        return result;
    }

    async $destroyGreeter(greeterId: string): Promise<void> {
        delete this.greeterData[greeterId];
    }

    $updateGreeter(data: GreeterData): void {
        const myData = this.greeterData[data.uuid];
        if (myData) {
            myData.greetingKinds = [...data.greetingKinds];
            this.proxy.$greeterUpdated({ ...myData });
        }
    }

    async $getMessage(greeterId: string): Promise<string> {
        const data = this.greeterData[greeterId];
        if (data.greetingKinds.length === 0) {
            throw new Error(`No greetings are available for greeter ${greeterId}`);
        }

        // Get a random one of our supported greeting kinds.
        const kind = data.greetingKinds[(Math.floor(Math.random() * data.greetingKinds.length))];
        // And a random greeting of that kind
        const greetingIdx = Math.floor(Math.random() * GREETINGS[kind].length);

        return GREETINGS[kind][greetingIdx];
    }
}
