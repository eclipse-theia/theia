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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// HostedPluginSupport transitively imports browser widgets (Lumino) that touch `document` at load time.
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
// Some transitively imported modules read the frontend config at load time.
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Disposable, DisposableCollection } from '@theia/core/lib/common';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { FrontendApplicationState } from '@theia/core/lib/common/frontend-application-state';
import { HostedPluginSupport } from './hosted-plugin';

disableJSDOM();

describe('HostedPluginSupport - plugin view initialization', () => {

    it('initializes plugin views once the application is ready, after the onDidInitializeLayout hooks', async () => {
        const states = new Map<FrontendApplicationState, Deferred<void>>();
        const reach = (state: FrontendApplicationState): Deferred<void> => {
            if (!states.has(state)) {
                states.set(state, new Deferred<void>());
            }
            return states.get(state)!;
        };
        const calls: string[] = [];
        const support = new HostedPluginSupport();
        Object.assign(support, {
            appState: { reachedState: (state: FrontendApplicationState) => reach(state).promise },
            viewRegistry: {
                initWidgets: async () => { calls.push('initWidgets'); },
                removeStaleWidgets: () => { calls.push('removeStaleWidgets'); }
            },
            workspaceTrustService: { refreshRestrictedModeIndicator: () => { } }
        });
        const flush = () => new Promise(resolve => setTimeout(resolve));

        await (support as unknown as { afterLoadContributions(toDisconnect: DisposableCollection): Promise<void> })
            .afterLoadContributions(new DisposableCollection(Disposable.NULL));
        reach('initialized_layout').resolve();
        await flush();
        expect(calls).to.deep.equal([]);

        reach('ready').resolve();
        await flush();
        expect(calls).to.deep.equal(['initWidgets', 'removeStaleWidgets']);
    });

});
