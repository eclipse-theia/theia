// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { Emitter } from '@theia/core/lib/common';
import { Container } from '@theia/core/shared/inversify';
import {
    PreferenceTelemetryConsentProvider, TelemetryConsentProvider, TelemetryLevel, isKindAllowedByLevel
} from './telemetry-consent-provider';
import { TELEMETRY_FILTERS, TELEMETRY_LEVEL, TelemetryPreferences } from './telemetry-preferences';

describe('telemetry consent provider', () => {
    it('maps telemetry levels to event kinds', () => {
        const kinds = ['usage', 'error', 'crash'] as const;
        const levels: TelemetryLevel[] = ['off', 'crash', 'error', 'all'];
        expect(levels.map(level => kinds.filter(kind => isKindAllowedByLevel(level, kind)))).to.deep.equal([
            [],
            ['crash'],
            ['error', 'crash'],
            ['usage', 'error', 'crash']
        ]);
    });

    it('reads the preference after readiness and fires on changes', async () => {
        const changes = new Emitter<never>();
        let level: TelemetryLevel = 'error';
        const preferences = {
            get [TELEMETRY_LEVEL](): TelemetryLevel {
                return level;
            },
            [TELEMETRY_FILTERS]: {},
            ready: Promise.resolve(),
            onPreferenceChanged: changes.event
        } as unknown as TelemetryPreferences;
        const container = new Container();
        container.bind(TelemetryPreferences).toConstantValue(preferences);
        container.bind(TelemetryConsentProvider).to(PreferenceTelemetryConsentProvider).inSingletonScope();
        const provider = container.get<TelemetryConsentProvider>(TelemetryConsentProvider);
        const observed: TelemetryLevel[] = [];
        provider.onDidChangeTelemetryLevel(value => observed.push(value));

        await preferences.ready;
        await Promise.resolve();
        expect(provider.level).to.equal('error');

        level = 'all';
        changes.fire({ preferenceName: TELEMETRY_LEVEL } as never);
        expect(provider.level).to.equal('all');
        expect(observed).to.deep.equal(['all']);
    });
});
