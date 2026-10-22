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
import { Emitter } from '@theia/core/lib/common';
import { Container } from '@theia/core/shared/inversify';
import { PreferenceTelemetryConsentProvider, TelemetryConsentProvider } from './telemetry-consent-provider';
import { TELEMETRY_FILTERS, TELEMETRY_LEVEL, TelemetryPreferences } from './telemetry-preferences';
import { TelemetryLevel } from './telemetry-types';

describe('telemetry consent provider', () => {

    function createPreferences(ready: Promise<void>, level: () => TelemetryLevel, changes: Emitter<never>): TelemetryPreferences {
        return {
            get [TELEMETRY_LEVEL](): TelemetryLevel {
                return level();
            },
            [TELEMETRY_FILTERS]: {},
            ready,
            onPreferenceChanged: changes.event
        } as unknown as TelemetryPreferences;
    }

    function createProvider(preferences: TelemetryPreferences): TelemetryConsentProvider {
        const container = new Container();
        container.bind(TelemetryPreferences).toConstantValue(preferences);
        container.bind(TelemetryConsentProvider).to(PreferenceTelemetryConsentProvider).inSingletonScope();
        return container.get<TelemetryConsentProvider>(TelemetryConsentProvider);
    }

    it('applies and reports preference changes before readiness', () => {
        const changes = new Emitter<never>();
        let level: TelemetryLevel = 'off';
        const provider = createProvider(createPreferences(new Promise<void>(() => undefined), () => level, changes));
        const observed: TelemetryLevel[] = [];
        provider.onDidChangeTelemetryLevel(value => observed.push(value));

        level = 'error';
        changes.fire({ preferenceName: TELEMETRY_LEVEL } as never);

        expect(provider.level).to.equal('error');
        expect(observed).to.deep.equal(['error']);
    });

    it('starts off, then reads the preference after readiness and fires on changes', async () => {
        const changes = new Emitter<never>();
        let resolveReady: () => void;
        let level: TelemetryLevel = 'error';
        const provider = createProvider(createPreferences(new Promise<void>(resolve => resolveReady = resolve), () => level, changes));
        const observed: TelemetryLevel[] = [];
        provider.onDidChangeTelemetryLevel(value => observed.push(value));

        expect(provider.level).to.equal('off');
        resolveReady!();
        await provider.ready;
        expect(provider.level).to.equal('error');

        level = 'all';
        changes.fire({ preferenceName: TELEMETRY_LEVEL } as never);
        expect(provider.level).to.equal('all');
        expect(observed).to.deep.equal(['error', 'all']);
    });

    it('settles ready with the level left at its default when reading the preferences fails', async () => {
        const provider = createProvider(createPreferences(Promise.reject(new Error('no preferences')), () => 'all', new Emitter<never>()));

        await provider.ready;

        expect(provider.level).to.equal('off');
    });
});
