// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const BROWSER_DIR = join(__dirname, '../../src/browser');
const panelSource = readFileSync(join(BROWSER_DIR, 'mobile-projects-panel.ts'), 'utf8');
const transcriptStateSource = readFileSync(
    join(__dirname, '../../../qaap-transcript-overlay/src/browser/mobile-projects-transcript-overlay-state.ts'),
    'utf8',
);

/** Methods invoked via `this.host.foo(` that live on extracted *Ui modules, not on the panel class. */
const HOST_INTERFACE_ONLY = new Set([
    'closeTranscriptComposerSheets', // transcript-composer-ui Host interface
]);

function collectHostMethodCalls(source: string): Set<string> {
    const calls = new Set<string>();
    const re = /this\.host\.(\w+)\(/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
        calls.add(match[1]);
    }
    return calls;
}

function panelExposesHostMember(method: string): boolean {
    if (HOST_INTERFACE_ONLY.has(method)) {
        return true;
    }
    if (new RegExp(`${method}\\s*\\(`).test(panelSource)) {
        return true;
    }
    // Options injected at construction (pickContextVariable, createDiffReviewWidget, …)
    if (new RegExp(`(?:readonly\\s+)?${method}\\s*[:=]`).test(panelSource)) {
        return true;
    }
    // Phase 2: transcript overlay state fields are bound onto the panel at runtime.
    if (new RegExp(`(?:readonly\\s+)?${method}\\s*[:=]`).test(transcriptStateSource)) {
        return true;
    }
    return false;
}

function collectUiModuleSources(): string[] {
    return readdirSync(BROWSER_DIR)
        .filter(name => name.startsWith('mobile-projects-') && name.endsWith('-ui.ts'))
        .map(name => readFileSync(join(BROWSER_DIR, name), 'utf8'));
}

/**
 * Regression guard: MobileProjects*Ui modules call `this.host.foo()` on the panel cast.
 * One-liner delegates removed during panel slim-down must stay on MobileProjectsPanel.
 */
describe('mobile-projects-panel host delegates', () => {

    const REQUIRED_PANEL_DELEGATES = [
        'closeParallelSheet',
        'detachTranscriptReviewWidget',
        'disposeTranscriptEmbeddedPreview',
        'detachTranscriptWorkspaceSurfacesFromSheet',
        'closeAgentsHubSession',
        'teardownAgentsHubExecutionShell',
        'openAgentsHubInlineTranscript',
        'notifyWorkspaceHubBottomBarRefresh',
        'syncTranscriptPreviewFromConversation',
        'handleTranscriptStatusForAutoVerify',
        'getChatServiceConversation',
        'resolveActiveTranscriptChatHost',
        'refreshOpenTranscriptConversation',
        'openConversationSummary',
        'submitTranscriptViaBackendConversation',
        'submitBackgroundAgentTask',
        'renderAgentsHubIdleSubmitOptimistic',
        'applyTaskStartedToProject',
        'resolveAgentsHubShellProject',
        'resolveAgentsHubShellSummary',
        'renderAgentsHubExecutionShell',
        'shouldPreserveAgentsHubInlineTranscriptShell',
        'shouldSkipFullRenderListOnConversationTick',
        'refreshWorkHubConversationChrome',
        'shouldUseAgentsHubLanding',
        'isProjectDetailView',
        'ensureOverlayUi',
        'appendTranscriptHeaderActions',
        'createProjectDetailView',
        'disposeTranscriptTerminalSlides',
        'syncSearchChrome',
        'renderTranscriptInlineApproval',
        'onResumePreview',
    ] as const;

    for (const method of REQUIRED_PANEL_DELEGATES) {
        it(`declares ${method} on MobileProjectsPanel`, () => {
            expect(panelExposesHostMember(method)).to.equal(true);
        });
    }

    it('declares every this.host method call used by MobileProjects*Ui modules', () => {
        const missing: string[] = [];
        for (const source of collectUiModuleSources()) {
            for (const method of collectHostMethodCalls(source)) {
                if (!panelExposesHostMember(method)) {
                    missing.push(method);
                }
            }
        }
        expect([...new Set(missing)].sort()).to.deep.equal([]);
    });
});
