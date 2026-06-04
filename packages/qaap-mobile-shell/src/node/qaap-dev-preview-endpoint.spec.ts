// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { QaapDevPreviewEndpoint } from './qaap-dev-preview-endpoint';

class TestQaapDevPreviewEndpoint extends QaapDevPreviewEndpoint {
    exposeRewriteDevPreviewBody(body: string, targetPort: number): string {
        return this.rewriteDevPreviewBody(body, targetPort);
    }

    exposeRewriteDevPreviewLocation(location: string, targetPort: number): string {
        return this.rewriteDevPreviewLocation(location, targetPort);
    }
}

describe('QaapDevPreviewEndpoint', () => {

    const endpoint = new TestQaapDevPreviewEndpoint();

    it('rewrites Vite absolute imports to the qaap-dev proxy prefix', () => {
        const body = [
            '<script type="module" src="/src/main.jsx"></script>',
            'import "/@vite/client";',
            'import React from "/node_modules/.vite/deps/react.js?v=123";',
            'export { value } from "/src/module.js";',
            'const worker = new URL("/src/worker.js", import.meta.url);',
            'const model = "/models/iphone16promax.glb";',
            '.hero { background: url(/assets/bg.png); }',
        ].join('\n');

        expect(endpoint.exposeRewriteDevPreviewBody(body, 5184)).to.equal([
            '<script type="module" src="/qaap-dev/5184/src/main.jsx"></script>',
            'import "/qaap-dev/5184/@vite/client";',
            'import React from "/qaap-dev/5184/node_modules/.vite/deps/react.js?v=123";',
            'export { value } from "/qaap-dev/5184/src/module.js";',
            'const worker = new URL("/qaap-dev/5184/src/worker.js", import.meta.url);',
            'const model = "/qaap-dev/5184/models/iphone16promax.glb";',
            '.hero { background: url(/qaap-dev/5184/assets/bg.png); }',
        ].join('\n'));
    });

    it('rewrites root-relative redirects through the qaap-dev proxy prefix', () => {
        expect(endpoint.exposeRewriteDevPreviewLocation('/login', 5184)).to.equal('/qaap-dev/5184/login');
        expect(endpoint.exposeRewriteDevPreviewLocation('/qaap-dev/5184/login', 5184)).to.equal('/qaap-dev/5184/login');
    });
});
