// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildDevPreviewWaitingHtml,
    buildQaapDevPreviewOpenUrl,
    buildQaapDevPreviewUrl,
    parseQaapDevPreviewRequestPath,
    parseQaapDevPreviewPort,
} from './qaap-dev-preview';

describe('qaap-dev-preview', () => {

    it('buildQaapDevPreviewUrl works for VPS IP origins', () => {
        expect(buildQaapDevPreviewUrl('http://178.105.136.93:3000', 3001))
            .to.equal('http://178.105.136.93:3000/qaap-dev/3001/');
    });

    it('buildQaapDevPreviewOpenUrl uses the same-origin proxy on localhost too', () => {
        expect(buildQaapDevPreviewOpenUrl('http://localhost:3000', 5173))
            .to.equal('http://localhost:3000/qaap-dev/5173/');
        expect(buildQaapDevPreviewOpenUrl('http://127.0.0.1:3000', 5173))
            .to.equal('http://127.0.0.1:3000/qaap-dev/5173/');
    });

    it('buildQaapDevPreviewOpenUrl keeps the proxy for remote origins', () => {
        expect(buildQaapDevPreviewOpenUrl('http://178.105.136.93:3000', 5173))
            .to.equal('http://178.105.136.93:3000/qaap-dev/5173/');
    });

    it('parseQaapDevPreviewRequestPath extracts port and path', () => {
        expect(parseQaapDevPreviewRequestPath('/qaap-dev/5173/@vite/client')).to.deep.equal({
            port: 5173,
            targetPath: '/@vite/client',
        });
    });

    it('parseQaapDevPreviewPort rejects privileged ports', () => {
        expect(parseQaapDevPreviewPort('80')).to.equal(undefined);
        expect(parseQaapDevPreviewPort('3001')).to.equal(3001);
    });

    it('buildDevPreviewWaitingHtml embeds the port and auto-reload script', () => {
        const html = buildDevPreviewWaitingHtml(3001);
        expect(html).to.contain('3001');
        expect(html).to.contain('location.reload');
        expect(html).to.contain('Starting dev server');
    });
});
