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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { RPCProtocol } from '@theia/plugin-ext/lib/common/rpc-protocol';
import { Plugin } from '@theia/plugin-ext/lib/common/plugin-api-rpc';
import type * as gotd from '../gotd';
import { GreetingKind, GreetingExt, MAIN_RPC_CONTEXT } from '../common/plugin-api-rpc';
import { GreetingExtImpl } from './greeting-ext-impl';
import { Disposable, DisposableCollection } from '@theia/core';
import { PluginContainerModule } from '@theia/plugin-ext/lib/plugin/node/plugin-container-module';

// This script is responsible for creating and returning the extension's
// custom API object when a plugin's module imports it. Keep in mind that
// all of the code here runs in the plugin-host node process, whether that
// be the backend host dedicated to some frontend connection or the single
// host for headless plugins, which is where the plugin itself is running.

type Gotd = typeof gotd;
const GotdApiFactory = Symbol('GotdApiFactory');

// Retrieved by Theia to configure the Inversify DI container when the plugin is initialized.
// This is called when the plugin-host process is forked.
export const containerModule = PluginContainerModule.create(({ bind, bindApiFactory }) => {
    bind(GreetingExt).to(GreetingExtImpl).inSingletonScope();
    bindApiFactory('@theia/api-provider-sample', GotdApiFactory, GotdApiFactoryImpl);
});

// Creates the Greeting of the Day API object
@injectable()
class GotdApiFactoryImpl {
    @inject(RPCProtocol)
    protected readonly rpc: RPCProtocol;

    @inject(GreetingExt)
    protected readonly greetingExt: GreetingExt;

    @postConstruct()
    initialize(): void {
        this.rpc.set(MAIN_RPC_CONTEXT.GREETING_EXT, this.greetingExt);
    }

    createApi(plugin: Plugin): Gotd {
        const self = this;
        async function createGreeter(): Promise<gotd.greeting.Greeter> {
            const toDispose = new DisposableCollection();

            const uuid = await self.greetingExt.registerGreeter();
            toDispose.push(Disposable.create(() => self.greetingExt.unregisterGreeter(uuid)));

            const onGreetingKindsChanged = self.greetingExt.onGreetingKindsChanged(uuid);

            const result: gotd.greeting.Greeter = {
                get greetingKinds(): readonly GreetingKind[] {
                    return self.greetingExt.getGreetingKinds(uuid);
                },

                setGreetingKind(greetingKind: GreetingKind, enable = true): void {
                    self.greetingExt.setGreetingKindEnabled(uuid, greetingKind, enable);
                },

                getMessage(): Promise<string> {
                    return self.greetingExt.getMessage(uuid);
                },

                onGreetingKindsChanged,

                dispose: toDispose.dispose.bind(toDispose),
            };

            return result;
        }

        const greeting: Gotd['greeting'] = {
            createGreeter,
            GreetingKind
        };

        return {
            greeting,
            Disposable,
        };
    };
}
