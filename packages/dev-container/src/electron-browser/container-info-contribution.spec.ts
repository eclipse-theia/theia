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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import { Container } from '@theia/core/shared/inversify';
import { RemoteStatusService } from '@theia/remote/lib/electron-common/remote-status-service';
import { PortForwardingService } from '@theia/remote/lib/electron-browser/port-forwarding/port-forwarding-service';
import { expect } from 'chai';
import { RemoteContainerConnectionProvider } from '../electron-common/remote-container-connection-provider.js';
import { ContainerInfoContribution } from './container-info-contribution.js';

describe('ContainerInfoContribution', () => {

    let calls: string[];
    let disableJSDOM: () => void;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    const setup = (): ContainerInfoContribution => {
        calls = [];
        const container = new Container();
        container.bind(RemoteContainerConnectionProvider).toConstantValue(<Partial<RemoteContainerConnectionProvider>>{
            getCurrentContainerInfo: async (port: number) => { calls.push(`info ${port}`); return undefined; }
        } as RemoteContainerConnectionProvider);
        container.bind(RemoteStatusService).toConstantValue(<RemoteStatusService>{
            getStatus: async (port: number) => { calls.push(`status ${port}`); return { alive: false }; }
        });
        container.bind(PortForwardingService).toConstantValue(<Partial<PortForwardingService>>{ forwardedPorts: [] } as PortForwardingService);
        container.bind(ContainerInfoContribution).toSelf();
        return container.get(ContainerInfoContribution);
    };

    afterEach(() => {
        window.history.replaceState({}, '', location.pathname);
    });

    it('does not ask the backend about a container when the window is not connected to one', async () => {
        await setup().onStart();
        expect(calls).to.be.empty;
    });

    it('asks the backend about the container that the window is connected to', async () => {
        window.history.replaceState({}, '', '?port=4321');
        await setup().onStart();
        expect(calls).to.deep.equal(['info 4321', 'status 4321']);
    });
});
