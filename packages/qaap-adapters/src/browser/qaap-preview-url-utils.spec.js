"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
var chai_1 = require("chai");
var qaap_preview_url_utils_1 = require("./qaap-preview-url-utils");
describe('qaap-preview-url-utils', function () {
    it('rewrites direct localhost dev ports to the qaap-dev proxy', function () {
        (0, chai_1.expect)((0, qaap_preview_url_utils_1.normalizePreviewUrlForSameOrigin)('http://localhost:5173/', 'http://localhost:3000'))
            .to.equal('http://localhost:3000/qaap-dev/5173/');
        (0, chai_1.expect)((0, qaap_preview_url_utils_1.normalizePreviewUrlForSameOrigin)('http://127.0.0.1:5173/@vite/client', 'http://localhost:3000'))
            .to.equal('http://localhost:3000/qaap-dev/5173/@vite/client');
    });
    it('rewrites bare localhost dev ports to the qaap-dev proxy', function () {
        (0, chai_1.expect)((0, qaap_preview_url_utils_1.normalizePreviewUrlForSameOrigin)('localhost:5184', 'http://localhost:3000'))
            .to.equal('http://localhost:3000/qaap-dev/5184/');
        (0, chai_1.expect)((0, qaap_preview_url_utils_1.normalizePreviewUrlForSameOrigin)('127.0.0.1:5184/app', 'http://localhost:3000'))
            .to.equal('http://localhost:3000/qaap-dev/5184/app');
    });
    it('leaves already-proxied URLs unchanged', function () {
        var proxied = 'http://localhost:3000/qaap-dev/5173/';
        (0, chai_1.expect)((0, qaap_preview_url_utils_1.normalizePreviewUrlForSameOrigin)(proxied, 'http://localhost:3000')).to.equal(proxied);
    });
    it('buildSameOriginDevPreviewUrl uses the proxy path', function () {
        (0, chai_1.expect)((0, qaap_preview_url_utils_1.buildSameOriginDevPreviewUrl)(5173, 'http://localhost:3000'))
            .to.equal('http://localhost:3000/qaap-dev/5173/');
    });
    it('toPreviewHistoryDisplayUrl maps proxy paths to direct localhost ports', function () {
        (0, chai_1.expect)((0, qaap_preview_url_utils_1.toPreviewHistoryDisplayUrl)('http://localhost:3000/qaap-dev/3001/', 'http://localhost:3000'))
            .to.equal('http://localhost:3001/');
        (0, chai_1.expect)((0, qaap_preview_url_utils_1.toPreviewHistoryDisplayUrl)('http://localhost:3000/qaap-dev/5173/app', 'http://localhost:3000'))
            .to.equal('http://localhost:5173/app');
    });
    it('canonicalPreviewHistoryKey dedupes proxy and direct dev URLs', function () {
        var origin = 'http://localhost:3000';
        var direct = 'http://localhost:3001/';
        var proxied = 'http://localhost:3000/qaap-dev/3001/';
        (0, chai_1.expect)((0, qaap_preview_url_utils_1.canonicalPreviewHistoryKey)(direct, origin))
            .to.equal((0, qaap_preview_url_utils_1.canonicalPreviewHistoryKey)(proxied, origin));
    });
});
