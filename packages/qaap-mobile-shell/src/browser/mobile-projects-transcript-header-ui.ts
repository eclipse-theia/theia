// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { type QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import { resolveTranscriptEffectiveStatus } from '../common/qaap-transcript-turn-status';
import {
    type MobileProjectEntry,
    MOBILE_PROJECT_STATUS_COLORS,
} from './mobile-projects-types';
import type { WorkHubTranscriptBridge } from './work-hub-transcript-bridge';

/** Panel surface for active-chat header subtitle chips and live chrome refresh. */
export interface MobileProjectsTranscriptHeaderHost {
    transcriptOpenSummaryId: string | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptLastConv: import('../common/qaap-agent-conversation-client').QaapAgentConversationDTO | undefined;
    transcriptOpenProject: MobileProjectEntry | undefined;
    agentsHubInlineActive: boolean;
    visible: boolean;
    transcriptComposerSendRefresh: (() => void) | undefined;

}

/** Status / activity chips in the transcript execution header. */
export class MobileProjectsTranscriptHeaderUi {

    protected lastExecutionChromeKey = '';

    constructor(
        protected readonly host: MobileProjectsTranscriptHeaderHost,
        protected readonly workHub: WorkHubTranscriptBridge,
    ) { }

    createExecutionHeaderSubtitle(
        project: MobileProjectEntry,
        summary?: QaapAgentConversationSummaryDTO,
    ): HTMLDivElement {
        const subtitle = document.createElement('div');
        subtitle.className = 'theia-mobile-projects-subtitle';
        this.renderActiveChatHeaderSubtitle(subtitle, project, summary);
        return subtitle;
    }

    renderActiveChatHeaderSubtitle(
        host: HTMLElement,
        project: MobileProjectEntry,
        summary?: QaapAgentConversationSummaryDTO,
    ): void {
        host.className = 'theia-mobile-projects-subtitle theia-mod-active-chat-context';
        host.hidden = false;
        host.replaceChildren();
        host.append(
            this.createActiveChatContextChip(
                this.activeChatStatusIcon(summary),
                this.activeChatStatusLabel(project, summary),
                nls.localize('qaap/mobileProjects/statusChipAria', 'Status'),
                this.activeChatStatusClass(project, summary),
            ),
            this.createActiveChatContextChip(
                'codicon-clock',
                this.activeChatActivityLabel(project, summary),
                nls.localize('qaap/mobileProjects/activityChipAria', 'Last activity'),
            ),
        );
    }

    createActiveChatContextChip(
        iconClass: string,
        label: string,
        ariaLabel: string,
        modifier?: string,
    ): HTMLElement {
        const chip = document.createElement('span');
        chip.className = `theia-mobile-projects-active-chat-chip${modifier ? ` ${modifier}` : ''}`;
        chip.title = `${ariaLabel}: ${label}`;
        const icon = document.createElement('span');
        icon.className = `codicon ${iconClass}`;
        icon.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.className = 'theia-mobile-projects-active-chat-chip-text';
        text.textContent = label;
        chip.append(icon, text);
        return chip;
    }

    activeChatStatusLabel(
        project: MobileProjectEntry,
        summary?: QaapAgentConversationSummaryDTO,
    ): string {
        const effectiveStatus = this.resolveActiveChatEffectiveStatus(summary);
        if (effectiveStatus === 'streaming') {
            return summary?.activityLabel?.trim()
                || nls.localize('qaap/mobileProjects/chatStatusStreaming', 'Working');
        }
        if (summary?.status === 'failed') {
            return nls.localize('qaap/mobileProjects/chatStatusFailed', 'Failed');
        }
        if (summary?.priority) {
            return nls.localize('qaap/mobileProjects/chatStatusNeedsYou', 'Needs you');
        }
        if (summary && this.host.transcriptOpenSummaryId === summary.id && effectiveStatus === 'idle') {
            return nls.localize('qaap/mobileProjects/chatStatusReady', 'Ready');
        }
        const status = MOBILE_PROJECT_STATUS_COLORS[project.status];
        return nls.localize(status.labelKey, status.defaultLabel);
    }

    resolveActiveChatEffectiveStatus(
        summary?: QaapAgentConversationSummaryDTO,
    ): QaapAgentConversationSummaryDTO['status'] | undefined {
        const summaryId = summary?.id ?? this.host.transcriptOpenSummaryId;
        const conv = this.host.transcriptLastConv;
        if (conv && summaryId && conv.id === summaryId) {
            return resolveTranscriptEffectiveStatus(conv);
        }
        return summary?.status;
    }

    /** Keep header status chips and composer send/stop controls in sync during live SSE. */
    refreshTranscriptExecutionChrome(): void {
        const project = this.host.transcriptOpenProject;
        const summary = this.host.transcriptOpenSummary;
        if (this.host.agentsHubInlineActive && project && this.host.visible && summary) {
            const status = this.resolveActiveChatEffectiveStatus(summary) ?? summary.status;
            const chromeKey = [
                project.status,
                summary.id,
                status,
                summary.priority ? '1' : '0',
                summary.status ?? '',
                String(summary.updatedAt ?? ''),
            ].join('|');
            if (chromeKey !== this.lastExecutionChromeKey) {
                this.lastExecutionChromeKey = chromeKey;
                this.workHub.refreshHubSubtitle();
            }
        }
        this.host.transcriptComposerSendRefresh?.();
    }

    activeChatStatusIcon(summary?: QaapAgentConversationSummaryDTO): string {
        if (this.resolveActiveChatEffectiveStatus(summary) === 'streaming') {
            return 'codicon-loading';
        }
        if (summary?.status === 'failed') {
            return 'codicon-error';
        }
        if (summary?.priority) {
            return 'codicon-warning';
        }
        return 'codicon-circle-filled';
    }

    activeChatStatusClass(
        project: MobileProjectEntry,
        summary?: QaapAgentConversationSummaryDTO,
    ): string {
        if (this.resolveActiveChatEffectiveStatus(summary) === 'streaming') {
            return 'theia-mod-running';
        }
        if (summary?.status === 'failed') {
            return 'theia-mod-failed';
        }
        if (summary?.priority || project.status === 'review') {
            return 'theia-mod-needs-input';
        }
        if (project.status === 'working') {
            return 'theia-mod-running';
        }
        return 'theia-mod-idle';
    }

    activeChatActivityLabel(
        project: MobileProjectEntry,
        summary?: QaapAgentConversationSummaryDTO,
    ): string {
        const timestamp = summary?.updatedAt ?? (project.lastActiveAt ? Date.parse(project.lastActiveAt) : undefined);
        if (timestamp && Number.isFinite(timestamp)) {
            return nls.localize(
                'qaap/mobileProjects/chatLastActivity',
                'Active {0}',
                this.formatActiveChatSince(timestamp),
            );
        }
        if (project.lastActive && project.lastActive !== '—') {
            return nls.localize('qaap/mobileProjects/chatLastActivity', 'Active {0}', project.lastActive);
        }
        return nls.localize('qaap/mobileProjects/chatLastActivityUnknown', 'No recent activity');
    }

    isPendingNewChatSummary(summary: QaapAgentConversationSummaryDTO): boolean {
        return summary.id.startsWith('pending-new-chat-');
    }

    resolveTranscriptHeaderTitle(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): string {
        const title = summary.title?.trim();
        if (!title || title === project.name) {
            return project.name;
        }
        return nls.localize('qaap/mobileProjects/chatHeaderProjectTitle', '{0} · {1}', project.name, title);
    }

    formatActiveChatSince(timestamp: number): string {
        const diff = Math.max(0, Date.now() - timestamp);
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (diff < 45 * 1000) {
            return nls.localize('qaap/mobileProjects/activityJustNow', 'now');
        }
        if (diff < hour) {
            return nls.localize('qaap/mobileProjects/activityMinutesAgo', '{0} min ago', String(Math.max(1, Math.round(diff / minute))));
        }
        if (diff < day) {
            return nls.localize('qaap/mobileProjects/activityHoursAgo', '{0} h ago', String(Math.round(diff / hour)));
        }
        return nls.localize('qaap/mobileProjects/activityDaysAgo', '{0} d ago', String(Math.round(diff / day)));
    }
}
