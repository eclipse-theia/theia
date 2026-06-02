// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { buildSameOriginDevPreviewUrl, normalizePreviewUrlForSameOrigin } from './qaap-preview-url-utils';

describe('qaap-preview-url-utils', () => {

    it('rewrites direct localhost dev ports to the qaap-dev proxy', () => {
        expect(normalizePreviewUrlForSameOrigin('http://localhost:5173/', 'http://localhost:3000'))
            .to.equal('http://localhost:3000/qaap-dev/5173/');
        expect(normalizePreviewUrlForSameOrigin('http://127.0.0.1:5173/@vite/client', 'http://localhost:3000'))
            .to.equal('http://localhost:3000/qaap-dev/5173/@vite/client');
    });

    it('leaves already-proxied URLs unchanged', () => {
        const proxied = 'http://localhost:3000/qaap-dev/5173/';
        expect(normalizePreviewUrlForSameOrigin(proxied, 'http://localhost:3000')).to.equal(proxied);
    });

    it('buildSameOriginDevPreviewUrl uses the proxy path', () => {
        expect(buildSameOriginDevPreviewUrl(5173, 'http://localhost:3000'))
            .to.equal('http://localhost:3000/qaap-dev/5173/');
    });
});
