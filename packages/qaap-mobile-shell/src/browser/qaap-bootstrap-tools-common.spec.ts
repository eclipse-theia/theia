// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { serializeQaapBootstrapState } from './qaap-bootstrap-tools-common';
import type { QaapBootstrapStateChange } from './qaap-project-bootstrap-service';

describe('serializeQaapBootstrapState', () => {

    it('serializes descriptor and port hints for AI tools', () => {
        const rootUri = URI.fromFilePath('/tmp/demo');
        const state: QaapBootstrapStateChange = {
            phase: 'ready-to-run',
            descriptor: {
                rootUri,
                name: 'demo-app',
                kind: 'node-vite',
                packageManager: 'npm',
                installCommand: 'npm install',
                nodeModulesPresent: true,
                devCommand: 'npm run dev',
                devCommandLabel: 'npm run dev',
                expectedPort: 5173,
                apps: [],
            },
            previewUrl: 'http://localhost:5173/',
            lastPort: 5173,
        };
        const json = serializeQaapBootstrapState(state, [{
            port: 5173,
            url: 'http://localhost:5173/',
            firstSeenAt: 1,
            previewOpen: true,
            primary: true,
        }]);
        expect(json.phase).to.equal('ready-to-run');
        expect(json.projectName).to.equal('demo-app');
        expect(json.kind).to.equal('node-vite');
        expect(json.nodeModulesPresent).to.equal(true);
        expect(json.previewUrl).to.equal('http://localhost:5173/');
        expect(json.forwardedPorts).to.deep.equal([{ port: 5173, url: 'http://localhost:5173/', opened: true }]);
    });

    it('marks needsInstall when node_modules is missing', () => {
        const state: QaapBootstrapStateChange = {
            phase: 'detected',
            descriptor: {
                rootUri: URI.fromFilePath('/tmp/new'),
                name: 'new-app',
                kind: 'node-vite',
                packageManager: 'pnpm',
                installCommand: 'pnpm install',
                nodeModulesPresent: false,
                apps: [],
            },
        };
        const json = serializeQaapBootstrapState(state);
        expect(json.needsInstall).to.equal(true);
    });
});
