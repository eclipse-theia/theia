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
import { TelemetryService } from './telemetry-service';
import { TelemetryData } from './telemetry-types';

interface ConsumerPayload {
    action: string;
    duration: number;
    successful: boolean;
    tags: string[];
    measurements: readonly number[];
    states: boolean[];
}

const typedPayload = {
    action: 'open',
    duration: 12,
    successful: true,
    tags: ['editor', 'open'],
    measurements: [4, 8] as const,
    states: [true, false]
} satisfies TelemetryData<ConsumerPayload>;

const compileTimeUsage = (service: TelemetryService): void => service.report<ConsumerPayload>('consumer/action', typedPayload, {
    kind: 'error',
    attributes: { source: 'consumer' }
});

describe('telemetry service contract', () => {
    it('supports consumer-defined payload interfaces without an index signature', () => {
        expect(compileTimeUsage).to.be.a('function');
    });
});
