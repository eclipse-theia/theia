// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { Emitter, Event } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { TELEMETRY_LEVEL, TelemetryPreferences } from './telemetry-preferences';
import { TelemetryEventKind } from './telemetry-service';

/** @experimental */
export type TelemetryLevel = 'off' | 'crash' | 'error' | 'all';

/** @experimental */
export const TelemetryConsentProvider = Symbol('TelemetryConsentProvider');

/** @experimental */
export interface TelemetryConsentProvider {
    readonly level: TelemetryLevel;
    readonly onDidChangeTelemetryLevel: Event<TelemetryLevel>;
}

/** @experimental */
export function isKindAllowedByLevel(level: TelemetryLevel, kind: TelemetryEventKind): boolean {
    return level === 'all'
        || level === 'error' && (kind === 'error' || kind === 'crash')
        || level === 'crash' && kind === 'crash';
}

/** @experimental */
@injectable()
export class PreferenceTelemetryConsentProvider implements TelemetryConsentProvider {

    protected currentLevel: TelemetryLevel = 'all';
    protected readonly onDidChangeTelemetryLevelEmitter = new Emitter<TelemetryLevel>();
    readonly onDidChangeTelemetryLevel = this.onDidChangeTelemetryLevelEmitter.event;

    constructor(@inject(TelemetryPreferences) protected readonly preferences: TelemetryPreferences) { }

    @postConstruct()
    protected init(): void {
        this.preferences.ready.then(() => {
            this.currentLevel = this.preferences[TELEMETRY_LEVEL];
            this.preferences.onPreferenceChanged(change => {
                if (change.preferenceName === TELEMETRY_LEVEL) {
                    this.currentLevel = this.preferences[TELEMETRY_LEVEL];
                    this.onDidChangeTelemetryLevelEmitter.fire(this.currentLevel);
                }
            });
        }, () => undefined);
    }

    get level(): TelemetryLevel {
        return this.currentLevel;
    }
}
