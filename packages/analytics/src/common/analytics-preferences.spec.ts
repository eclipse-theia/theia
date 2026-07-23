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
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import {
    ANALYTICS_ENABLED,
    ANALYTICS_ROUTES,
    AnalyticsPreferenceSchema
} from './analytics-preferences';

describe('analytics preferences', () => {
    it('defines only the enabled and routes preference keys', () => {
        expect(Object.keys(AnalyticsPreferenceSchema.properties)).to.deep.equal([ANALYTICS_ENABLED, ANALYTICS_ROUTES]);
    });

    it('limits analytics preferences to user scope', () => {
        expect(AnalyticsPreferenceSchema.scope).to.equal(PreferenceScope.User);
    });

    it('uses safe defaults', () => {
        expect(AnalyticsPreferenceSchema.properties[ANALYTICS_ENABLED].default).to.be.false;
        expect(AnalyticsPreferenceSchema.properties[ANALYTICS_ROUTES].default).to.deep.equal({});
    });

    it('defines routes as sink IDs mapped to arrays of topic patterns', () => {
        expect(AnalyticsPreferenceSchema.properties[ANALYTICS_ROUTES]).to.include({ type: 'object' });
        expect(AnalyticsPreferenceSchema.properties[ANALYTICS_ROUTES].additionalProperties).to.deep.equal({
            type: 'array',
            items: { type: 'string' }
        });
    });
});
