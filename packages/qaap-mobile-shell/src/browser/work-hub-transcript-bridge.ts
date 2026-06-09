// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import type { MobileProjectEntry } from './mobile-projects-types';

/**
 * Explicit Work Hub surface used by the transcript overlay cluster (Phase 3).
 * Replaces ad-hoc `this.host.renderList()` / agents-hub calls from transcript `*Ui` modules.
 */
export interface WorkHubTranscriptBridge {
    isAgentsHubLanding(): boolean;
    isProjectDetailView(): boolean;
    shouldEmbedAgentsHubRecentsInWorkspaceTranscript(): boolean;
    openInlineTranscript(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): Promise<void>;
    refreshHubChrome(): void;
    refreshHubSubtitle(): void;
    closeAgentsHubSession(): void;
    teardownAgentsHubShell(): void;
    refreshHubBottomBar(): void;
    renderTeamSectionInTranscript(host: HTMLElement, conv: QaapAgentConversationDTO): void;
    renderInlineApproval(host: HTMLElement, conv: QaapAgentConversationDTO): void;
    createAgentsHubRecentsBlock(project: MobileProjectEntry): HTMLElement;
    createAgentsHubQuickActionsBlock(): HTMLElement;
    renderIdleSubmitOptimistic(
        chatHost: HTMLElement,
        summary: QaapAgentConversationSummaryDTO,
        draft: string,
        selectedAgentId: string,
    ): void;
}
