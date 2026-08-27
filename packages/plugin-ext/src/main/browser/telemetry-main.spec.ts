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
import { Emitter } from '@theia/core/lib/common/event';
import { Container } from '@theia/core/shared/inversify';
import { TelemetryConsentProvider } from '@theia/telemetry/lib/common/telemetry-consent-provider';
import { TelemetryLevel } from '@theia/telemetry/lib/common/telemetry-types';
import { RPCProtocol } from '../../common/rpc-protocol';
import { TelemetryMainImpl } from './telemetry-main';

describe('TelemetryMainImpl', () => {

    let level: TelemetryLevel;
    let pushed: TelemetryLevel[];
    let levelChanged: Emitter<TelemetryLevel>;
    let container: Container;
    let rpc: RPCProtocol;

    beforeEach(() => {
        level = 'off';
        pushed = [];
        levelChanged = new Emitter<TelemetryLevel>();
        container = new Container();
        container.bind(TelemetryConsentProvider).toConstantValue(<TelemetryConsentProvider>{
            get level(): TelemetryLevel { return level; },
            onDidChangeTelemetryLevel: levelChanged.event
        });
        rpc = {
            getProxy<T>(_proxyId: unknown): T {
                return {
                    $setTelemetryLevel: (next: TelemetryLevel) => { pushed.push(next); }
                } as unknown as T;
            },
            set: <T, R extends T>(_identifier: unknown, instance: R) => instance,
            dispose: () => { }
        } as RPCProtocol;
    });

    it('does not push a level on construction, the initial level is seeded through $init', () => {
        new TelemetryMainImpl(rpc, container);

        expect(pushed).to.be.empty;
    });

    it('pushes every level change to the plugin host', () => {
        new TelemetryMainImpl(rpc, container);

        levelChanged.fire('all');
        levelChanged.fire('error');

        expect(pushed).to.deep.equal(['all', 'error']);
    });

    it('stops pushing once disposed', () => {
        const telemetryMain = new TelemetryMainImpl(rpc, container);

        telemetryMain.dispose();
        levelChanged.fire('all');

        expect(pushed).to.be.empty;
    });
});
