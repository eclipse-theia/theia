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
import { TelemetryLevel, isKindAllowedByLevel, isTelemetryEventKind } from './telemetry-types';

describe('telemetry types', () => {
    it('validates telemetry event kinds', () => {
        expect(['usage', 'error', 'crash'].every(isTelemetryEventKind)).to.be.true;
        expect(isTelemetryEventKind('invalid')).to.be.false;
    });

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
});
