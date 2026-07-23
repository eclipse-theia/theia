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
import { AnalyticsData, AnalyticsService, isAnalyticsData } from './analytics-service';

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
} satisfies AnalyticsData<ConsumerPayload>;

const compileTimeUsage = (service: AnalyticsService): void => service.report<ConsumerPayload>('consumer/action', typedPayload);
expect(compileTimeUsage).to.be.a('function');

describe('analytics service contract', () => {
    it('accepts plain flat payloads with primitive analytics values', () => {
        expect(isAnalyticsData(typedPayload)).to.be.true;
        expect(isAnalyticsData({})).to.be.true;
    });

    it('accepts homogeneous primitive and empty arrays unchanged', () => {
        const strings = ['editor', 'open'];
        const numbers = [4, 8];
        const booleans = [true, false];
        const empty: string[] = [];
        const data = { strings, numbers, booleans, empty };

        expect(isAnalyticsData(data)).to.be.true;
        expect(data.strings).to.equal(strings);
        expect(data.numbers).to.equal(numbers);
        expect(data.booleans).to.equal(booleans);
        expect(data.empty).to.equal(empty);
    });

    it('rejects non-object payloads', () => {
        for (const value of [undefined, 'value', 1, true]) {
            expect(isAnalyticsData(value)).to.be.false;
        }
        // eslint-disable-next-line no-null/no-null
        expect(isAnalyticsData(null)).to.be.false;
    });

    it('rejects top-level arrays and nested objects', () => {
        expect(isAnalyticsData([])).to.be.false;
        expect(isAnalyticsData({ value: { nested: true } })).to.be.false;
    });

    it('rejects mixed, nested, and sparse arrays', () => {
        const sparse = new Array<string>(2);
        sparse[1] = 'value';

        expect(isAnalyticsData({ value: ['value', 1] })).to.be.false;
        expect(isAnalyticsData({ value: [['nested']] })).to.be.false;
        expect(isAnalyticsData({ value: sparse })).to.be.false;
    });

    it('rejects unsupported array elements', () => {
        expect(isAnalyticsData({ value: [{ nested: true }] })).to.be.false;
        expect(isAnalyticsData({ value: ['value', undefined] })).to.be.false;
        expect(isAnalyticsData({ value: ['value', () => 'value'] })).to.be.false;
        expect(isAnalyticsData({ value: ['value', Symbol('value')] })).to.be.false;
        expect(isAnalyticsData({ value: new Uint8Array([1, 2]) })).to.be.false;
    });

    it('rejects special and binary objects', () => {
        expect(isAnalyticsData(new Error('failure'))).to.be.false;
        expect(isAnalyticsData(new Date())).to.be.false;
        expect(isAnalyticsData(new URI('file:///workspace'))).to.be.false;
        expect(isAnalyticsData(new Uint8Array([1, 2]))).to.be.false;
    });

    it('rejects class instances even when their properties are flat', () => {
        class Payload {
            value = 'value';
        }
        expect(isAnalyticsData(new Payload())).to.be.false;
    });

    it('rejects unsupported values in otherwise plain payloads', () => {
        expect(isAnalyticsData({ value: undefined })).to.be.false;
        expect(isAnalyticsData({ value: () => 'value' })).to.be.false;
        expect(isAnalyticsData({ value: Symbol('value') })).to.be.false;
    });
});
