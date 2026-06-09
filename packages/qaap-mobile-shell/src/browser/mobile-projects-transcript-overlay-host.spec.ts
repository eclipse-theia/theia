// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
    MobileProjectsTranscriptComposerHost,
    MobileProjectsTranscriptHeaderHost,
    MobileProjectsTranscriptHistoryHost,
    MobileProjectsTranscriptLiveHost,
    MobileProjectsTranscriptMessagesHost,
    MobileProjectsTranscriptOverlayHost,
    MobileProjectsTranscriptSheetHost,
    MobileProjectsTranscriptStickyComposerHost,
    MobileProjectsTranscriptSubmitHost,
    MobileProjectsTranscriptSurfacesHost,
    MobileProjectsTranscriptVerifyHost,
} from './mobile-projects-transcript-overlay-host';

type ExpectTrue<T extends true> = T;
type OverlaySatisfiesModuleHost<Host> = MobileProjectsTranscriptOverlayHost extends Host ? true : false;

/** Compile-time guard: overlay host must satisfy every per-module host contract. */
export type TranscriptOverlayHostAssignabilityChecks = {
    composer: ExpectTrue<OverlaySatisfiesModuleHost<MobileProjectsTranscriptComposerHost>>;
    header: ExpectTrue<OverlaySatisfiesModuleHost<MobileProjectsTranscriptHeaderHost>>;
    history: ExpectTrue<OverlaySatisfiesModuleHost<MobileProjectsTranscriptHistoryHost>>;
    live: ExpectTrue<OverlaySatisfiesModuleHost<MobileProjectsTranscriptLiveHost>>;
    messages: ExpectTrue<OverlaySatisfiesModuleHost<MobileProjectsTranscriptMessagesHost>>;
    sheet: ExpectTrue<OverlaySatisfiesModuleHost<MobileProjectsTranscriptSheetHost>>;
    stickyComposer: ExpectTrue<OverlaySatisfiesModuleHost<MobileProjectsTranscriptStickyComposerHost>>;
    submit: ExpectTrue<OverlaySatisfiesModuleHost<MobileProjectsTranscriptSubmitHost>>;
    surfaces: ExpectTrue<OverlaySatisfiesModuleHost<MobileProjectsTranscriptSurfacesHost>>;
    verify: ExpectTrue<OverlaySatisfiesModuleHost<MobileProjectsTranscriptVerifyHost>>;
};

const BROWSER_DIR = join(__dirname, '../../src/browser');

/** Hub-facing calls must go through {@link WorkHubTranscriptBridge}, not `this.host`. */
const LEGACY_TRANSCRIPT_HOST_HUB_CALLS = new Set([
    'closeAgentsHubSession',
    'createAgentsHubQuickActionsBlock',
    'createAgentsHubRecentsBlock',
    'ensureOverlayUi',
    'openAgentsHubInlineTranscript',
    'render',
    'renderAgentsHubExecutionShell',
    'renderAgentsHubIdleSubmitOptimistic',
    'renderHeader',
    'renderList',
    'renderSubtitle',
    'renderTranscriptInlineApproval',
    'resolveAgentsHubShellProject',
    'resolveAgentsHubShellSummary',
    'shouldEmbedAgentsHubRecentsInWorkspaceTranscript',
    'shouldUseAgentsHubLanding',
    'teardownAgentsHubExecutionShell',
]);

function collectTranscriptUiSources(): string[] {
    return readdirSync(BROWSER_DIR)
        .filter(name => name.startsWith('mobile-projects-transcript-') && name.endsWith('-ui.ts'))
        .map(name => readFileSync(join(BROWSER_DIR, name), 'utf8'));
}

describe('mobile-projects-transcript-overlay-host', () => {

    it('routes transcript-to-hub calls through workHub, not this.host', () => {
        const legacyHostCalls: string[] = [];
        for (const source of collectTranscriptUiSources()) {
            for (const match of source.matchAll(/this\.host\.(\w+)\(/g)) {
                const method = match[1];
                if (LEGACY_TRANSCRIPT_HOST_HUB_CALLS.has(method)) {
                    legacyHostCalls.push(method);
                }
            }
        }
        expect([...new Set(legacyHostCalls)].sort()).to.deep.equal([]);
    });
});
