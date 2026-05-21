// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { formatQaapBootstrapChipLabel } from './qaap-bootstrap-display';
import type { QaapBootstrapStateChange } from './qaap-project-bootstrap-service';

describe('formatQaapBootstrapChipLabel', () => {

    it('formats Vite · :5173 · Running', () => {
        const state: QaapBootstrapStateChange = {
            phase: 'running',
            descriptor: {
                rootUri: URI.fromFilePath('/tmp/demo'),
                name: 'demo',
                kind: 'node-vite',
                packageManager: 'npm',
                installCommand: 'npm install',
                nodeModulesPresent: true,
                apps: [],
            },
            previewUrl: 'http://localhost:5173/',
            lastPort: 5173,
        };
        expect(formatQaapBootstrapChipLabel(state)).to.equal('Vite · :5173 · Running');
    });
});
