// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    normalizeTranscriptWorkspacePath,
    resolveTranscriptWorkspaceCwd,
} from './qaap-transcript-workspace-cwd';

describe('qaap-transcript-workspace-cwd', () => {
    it('normalizeTranscriptWorkspacePath trims trailing slashes', () => {
        expect(normalizeTranscriptWorkspacePath('/home/qaap/repo/')).to.equal('/home/qaap/repo');
    });

    it('prefers conversation cwd for VPS agent tasks', () => {
        const cwd = resolveTranscriptWorkspaceCwd({
            summary: {
                source: 'qaap-agent',
                cwd: '/home/qaap/agent-runs/project-a',
            },
            projectCwd: '/home/qaap/repos/other-open-in-ide',
        });
        expect(cwd).to.equal('/home/qaap/agent-runs/project-a');
    });

    it('prefers project cwd for local Theia chat', () => {
        const cwd = resolveTranscriptWorkspaceCwd({
            summary: {
                source: 'theia-chat',
                cwd: '/home/qaap/old-session-path',
            },
            projectCwd: '/home/qaap/repos/selected-in-hub',
        });
        expect(cwd).to.equal('/home/qaap/repos/selected-in-hub');
    });

    it('falls back to prepared clone path when project has no uri', () => {
        const cwd = resolveTranscriptWorkspaceCwd({
            summary: { source: 'theia-chat', cwd: '' },
            preparedCwd: '/home/qaap/clones/my-app',
        });
        expect(cwd).to.equal('/home/qaap/clones/my-app');
    });
});
