// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildQaapDevPreviewUrl,
    parseQaapDevPreviewRequestPath,
    parseQaapDevPreviewPort,
} from './qaap-dev-preview';

describe('qaap-dev-preview', () => {

    it('buildQaapDevPreviewUrl works for VPS IP origins', () => {
        expect(buildQaapDevPreviewUrl('http://178.105.136.93:3000', 3001))
            .to.equal('http://178.105.136.93:3000/qaap-dev/3001/');
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
});
