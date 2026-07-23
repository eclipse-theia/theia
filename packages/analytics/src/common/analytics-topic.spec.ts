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
import {
    isValidAnalyticsSinkId,
    isValidAnalyticsTopic,
    isValidAnalyticsTopicPattern,
    matchesAnalyticsTopic
} from './analytics-topic';

describe('analytics topic contract', () => {
    const validNames = ['company/metric', 'Company/Metric', 'company/product/metric', 'company-1/metric_2', 'company.name/metric'];
    const invalidNames = ['', 'company', '/company/metric', 'company/metric/', 'company//metric', 'company/*', '*/metric', 'company/**', 'company/metric!', ' company/metric'];

    for (const name of validNames) {
        it(`accepts topic and sink ID '${name}'`, () => {
            expect(isValidAnalyticsTopic(name)).to.be.true;
            expect(isValidAnalyticsSinkId(name)).to.be.true;
        });
    }

    for (const name of invalidNames) {
        it(`rejects topic and sink ID '${name}'`, () => {
            expect(isValidAnalyticsTopic(name)).to.be.false;
            expect(isValidAnalyticsSinkId(name)).to.be.false;
        });
    }

    it('accepts only exact, terminal prefix, and global patterns', () => {
        for (const pattern of ['company/metric', 'company/product/metric', 'company/*', 'company/product/*', '*']) {
            expect(isValidAnalyticsTopicPattern(pattern), pattern).to.be.true;
        }
        const invalidPatterns = [
            '', 'company', '/company/*', 'company/*/', 'company//metric', '*/metric',
            'company/*/metric', 'company/**', '**', '!company/metric', 'company/(metric)'
        ];
        for (const pattern of invalidPatterns) {
            expect(isValidAnalyticsTopicPattern(pattern), pattern).to.be.false;
        }
    });

    it('matches exact topics case-sensitively', () => {
        expect(matchesAnalyticsTopic('company/metric', 'company/metric')).to.be.true;
        expect(matchesAnalyticsTopic('company/metric', 'company/other')).to.be.false;
        expect(matchesAnalyticsTopic('company/metric', 'Company/metric')).to.be.false;
    });

    it('matches descendants of a terminal prefix only', () => {
        expect(matchesAnalyticsTopic('company/*', 'company/metric')).to.be.true;
        expect(matchesAnalyticsTopic('company/*', 'company/product/metric')).to.be.true;
        expect(matchesAnalyticsTopic('company/*', 'company')).to.be.false;
        expect(matchesAnalyticsTopic('company/*', 'companyElse/metric')).to.be.false;
    });

    it('matches every valid topic with the global pattern', () => {
        expect(matchesAnalyticsTopic('*', 'company/metric')).to.be.true;
        expect(matchesAnalyticsTopic('*', 'company/product/metric')).to.be.true;
    });

    it('does not match invalid patterns or topics', () => {
        expect(matchesAnalyticsTopic('company/**', 'company/metric')).to.be.false;
        expect(matchesAnalyticsTopic('*', 'company')).to.be.false;
    });
});
