// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildSameOriginDevPreviewUrl,
    canonicalPreviewHistoryKey,
    normalizePreviewUrlForSameOrigin,
    toPreviewHistoryDisplayUrl,
} from './qaap-preview-url-utils';

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

    it('toPreviewHistoryDisplayUrl maps proxy paths to direct localhost ports', () => {
        expect(toPreviewHistoryDisplayUrl('http://localhost:3000/qaap-dev/3001/', 'http://localhost:3000'))
            .to.equal('http://localhost:3001/');
        expect(toPreviewHistoryDisplayUrl('http://localhost:3000/qaap-dev/5173/app', 'http://localhost:3000'))
            .to.equal('http://localhost:5173/app');
    });

    it('canonicalPreviewHistoryKey dedupes proxy and direct dev URLs', () => {
        const origin = 'http://localhost:3000';
        const direct = 'http://localhost:3001/';
        const proxied = 'http://localhost:3000/qaap-dev/3001/';
        expect(canonicalPreviewHistoryKey(direct, origin))
            .to.equal(canonicalPreviewHistoryKey(proxied, origin));
    });
});
