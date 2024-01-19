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
import { inject, injectable } from '@theia/core/shared/inversify';
import { GreetingKind, GreeterData, GreetingExt, GreetingMain, PLUGIN_RPC_CONTEXT } from '../common/plugin-api-rpc';
import { RPCProtocol } from '@theia/plugin-ext/lib/common/rpc-protocol';
import { Event, Emitter } from '@theia/core';

type LocalGreeterData = GreeterData & {
    onGreetingKindsChangedEmitter: Emitter<readonly GreetingKind[]>
};

@injectable()
export class GreetingExtImpl implements GreetingExt {
    private readonly proxy: GreetingMain;

    private greeterData: Record<string, LocalGreeterData> = {};

    constructor(@inject(RPCProtocol) rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.GREETING_MAIN);
    }

    async registerGreeter(): Promise<string> {
        const newGreeter = await this.proxy.$createGreeter();
        this.greeterData[newGreeter.uuid] = {
            ...newGreeter,
            onGreetingKindsChangedEmitter: new Emitter()
        };
        return newGreeter.uuid;
    }

    unregisterGreeter(uuid: string): Promise<void> {
        delete this.greeterData[uuid];
        return this.proxy.$destroyGreeter(uuid);
    }

    getGreetingKinds(greeterId: string): readonly GreetingKind[] {
        const data = this.greeterData[greeterId];
        return data ? [...data.greetingKinds] : [];
    }

    setGreetingKindEnabled(greeterId: string, greetingKind: GreetingKind, enable: boolean): void {
        const data = this.greeterData[greeterId];

        if (data.greetingKinds.includes(greetingKind) === enable) {
            return; // Nothing to change
        }

        if (enable) {
            data.greetingKinds.push(greetingKind);
        } else {
            const index = data.greetingKinds.indexOf(greetingKind);
            data.greetingKinds.splice(index, 1);
        }

        this.proxy.$updateGreeter({uuid: greeterId, greetingKinds: [...data.greetingKinds] });
    }

    onGreetingKindsChanged(greeterId: string): Event<readonly GreetingKind[]> {
        return this.greeterData[greeterId].onGreetingKindsChangedEmitter.event;
    }

    getMessage(greeterId: string): Promise<string> {
        return this.proxy.$getMessage(greeterId);
    }

    $greeterUpdated(data: GreeterData): void {
        const myData = this.greeterData[data.uuid];
        if (myData) {
            myData.greetingKinds = [...data.greetingKinds];
            myData.onGreetingKindsChangedEmitter.fire([...data.greetingKinds]);
        }
    }
}
