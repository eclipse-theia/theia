/*******************************************************************************
 * Copyright (C) 2026 EclipseSource GmbH and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License. v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.html
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 *******************************************************************************/

import * as chai from 'chai';
import { corePreferenceSchema } from './core-preferences';

const expect = chai.expect;

describe('core preference descriptions', () => {
    it('does not expose unresolved placeholders in HTTP descriptions', () => {
        const preferenceIds = [
            'http.proxy',
            'http.proxyStrictSSL',
            'http.proxyAuthorization',
            'http.proxySupport',
            'http.systemCertificates'
        ];

        for (const preferenceId of preferenceIds) {
            const preference = corePreferenceSchema.properties[preferenceId];
            const description = preference.markdownDescription ?? preference.description;

            expect(description, preferenceId).to.be.a('string');
            expect(description, preferenceId).not.to.contain('{0}');
        }
    });
});
