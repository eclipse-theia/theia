// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { readFileSync } from 'fs';
import { join } from 'path';
import { expect } from 'chai';

const PANEL_SOURCE = readFileSync(join(__dirname, '../../src/browser/mobile-projects-panel.ts'), 'utf8');

const WORK_HUB_TRANSCRIPT_BRIDGE_METHODS = [
    'isAgentsHubLanding',
    'isProjectDetailView',
    'shouldEmbedAgentsHubRecentsInWorkspaceTranscript',
    'openInlineTranscript',
    'refreshHubChrome',
    'refreshHubSubtitle',
    'closeAgentsHubSession',
    'teardownAgentsHubShell',
    'refreshHubBottomBar',
    'renderTeamSectionInTranscript',
    'renderInlineApproval',
    'createAgentsHubRecentsBlock',
    'createAgentsHubQuickActionsBlock',
    'renderIdleSubmitOptimistic',
] as const;

describe('work-hub-transcript-bridge', () => {

    for (const method of WORK_HUB_TRANSCRIPT_BRIDGE_METHODS) {
        it(`declares ${method} on MobileProjectsPanel`, () => {
            expect(new RegExp(`${method}\\s*\\(`).test(PANEL_SOURCE)).to.equal(true);
        });
    }
});
