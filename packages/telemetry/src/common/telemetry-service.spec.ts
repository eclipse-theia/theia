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

import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { TelemetryData, TelemetryService, isTelemetryData, snapshotTelemetryData } from './telemetry-service';

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

const compileTimeUsage = (service: TelemetryService): void => service.report<ConsumerPayload>('consumer/action', typedPayload);

describe('telemetry service contract', () => {
    it('supports consumer-defined payload interfaces without an index signature', () => {
        expect(compileTimeUsage).to.be.a('function');
    });
    it('accepts plain flat payloads with primitive telemetry values', () => {
        expect(isTelemetryData(typedPayload)).to.be.true;
        expect(isTelemetryData({})).to.be.true;
    });

    it('accepts homogeneous primitive and empty arrays unchanged', () => {
        const strings = ['editor', 'open'];
        const numbers = [4, 8];
        const booleans = [true, false];
        const empty: string[] = [];
        const data = { strings, numbers, booleans, empty };

        expect(isTelemetryData(data)).to.be.true;
        expect(data.strings).to.equal(strings);
        expect(data.numbers).to.equal(numbers);
        expect(data.booleans).to.equal(booleans);
        expect(data.empty).to.equal(empty);
    });

    it('creates immutable snapshots without transforming accepted values', () => {
        const strings = ['editor', 'open'];
        const data = { action: 'open', duration: 12, successful: true, strings };

        const snapshot = snapshotTelemetryData(data);

        expect(snapshot).to.deep.equal(data);
        expect(snapshot).not.to.equal(data);
        expect(snapshot?.strings).not.to.equal(strings);
        expect(Object.isFrozen(snapshot)).to.be.true;
        expect(Object.isFrozen(snapshot?.strings)).to.be.true;
        expect(snapshotTelemetryData(undefined)).to.be.undefined;
    });

    it('rejects non-object payloads', () => {
        for (const value of [undefined, 'value', 1, true]) {
            expect(isTelemetryData(value)).to.be.false;
        }
        // eslint-disable-next-line no-null/no-null
        expect(isTelemetryData(null)).to.be.false;
    });

    it('rejects top-level arrays and nested objects', () => {
        expect(isTelemetryData([])).to.be.false;
        expect(isTelemetryData({ value: { nested: true } })).to.be.false;
    });

    it('rejects mixed, nested, and sparse arrays', () => {
        const sparse = new Array<string>(2);
        sparse[1] = 'value';

        expect(isTelemetryData({ value: ['value', 1] })).to.be.false;
        expect(isTelemetryData({ value: [['nested']] })).to.be.false;
        expect(isTelemetryData({ value: sparse })).to.be.false;
    });

    it('rejects unsupported array elements', () => {
        expect(isTelemetryData({ value: [{ nested: true }] })).to.be.false;
        expect(isTelemetryData({ value: ['value', undefined] })).to.be.false;
        expect(isTelemetryData({ value: ['value', () => 'value'] })).to.be.false;
        expect(isTelemetryData({ value: ['value', Symbol('value')] })).to.be.false;
        expect(isTelemetryData({ value: new Uint8Array([1, 2]) })).to.be.false;
    });

    it('rejects special and binary objects', () => {
        expect(isTelemetryData(new Error('failure'))).to.be.false;
        expect(isTelemetryData(new Date())).to.be.false;
        expect(isTelemetryData(new URI('file:///workspace'))).to.be.false;
        expect(isTelemetryData(new Uint8Array([1, 2]))).to.be.false;
    });

    it('rejects class instances even when their properties are flat', () => {
        class Payload {
            value = 'value';
        }
        expect(isTelemetryData(new Payload())).to.be.false;
    });

    it('rejects unsupported values in otherwise plain payloads', () => {
        expect(isTelemetryData({ value: undefined })).to.be.false;
        expect(isTelemetryData({ value: () => 'value' })).to.be.false;
        expect(isTelemetryData({ value: Symbol('value') })).to.be.false;
    });
});
