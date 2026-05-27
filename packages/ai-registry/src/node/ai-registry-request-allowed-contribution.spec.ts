// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { AIRegistryConfiguration } from '../common/ai-registry-configuration';
import { AIRegistryRequestAllowedContribution } from './ai-registry-request-allowed-contribution';

describe('AIRegistryRequestAllowedContribution', () => {

    function createContribution(baseUrl?: string): AIRegistryRequestAllowedContribution {
        const contribution = new AIRegistryRequestAllowedContribution();
        const configuration = new AIRegistryConfiguration();
        if (baseUrl !== undefined) {
            configuration.getBaseUrl = () => baseUrl;
        }
        (contribution as unknown as { configuration: AIRegistryConfiguration }).configuration = configuration;
        return contribution;
    }

    it('should return the default registry origin', () => {
        const contribution = createContribution();
        const patterns = contribution.getAllowedUrlPatterns();
        expect(patterns).to.deep.equal(['https://eclipsefdn-ai-registry.github.io']);
    });

    it('should extract origin from a custom base URL with port', () => {
        const contribution = createContribution('https://internal.example:8443/registry/v2/');
        const patterns = contribution.getAllowedUrlPatterns();
        expect(patterns).to.deep.equal(['https://internal.example:8443']);
    });

    it('should extract origin from a custom base URL without trailing path', () => {
        const contribution = createContribution('https://my-registry.example.com');
        const patterns = contribution.getAllowedUrlPatterns();
        expect(patterns).to.deep.equal(['https://my-registry.example.com']);
    });

    it('should return an empty array for an invalid URL', () => {
        const contribution = createContribution('not-a-valid-url');
        const patterns = contribution.getAllowedUrlPatterns();
        expect(patterns).to.deep.equal([]);
    });

    it('should return an empty array for an empty string', () => {
        const contribution = createContribution('');
        const patterns = contribution.getAllowedUrlPatterns();
        expect(patterns).to.deep.equal([]);
    });

    it('should handle HTTP URLs', () => {
        const contribution = createContribution('http://localhost:3000/api/');
        const patterns = contribution.getAllowedUrlPatterns();
        expect(patterns).to.deep.equal(['http://localhost:3000']);
    });
});
