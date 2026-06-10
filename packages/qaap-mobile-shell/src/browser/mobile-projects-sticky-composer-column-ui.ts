// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { ChatMode } from '@theia/ai-chat';
import type { QaapComposerSurface } from '../common/qaap-composer-surface';
import {
    attachStickyComposerMentionUi,
    type StickyComposerTokenOption,
} from '../common/qaap-sticky-composer-mention';
import {
    resolveAgentApprovalPolicyOption,
    type QaapAgentApprovalPolicyId,
} from '../common/qaap-sticky-composer-approval-policy';
import {
    populateAgentToolbarButton,
    populateApprovalPolicyToolbarButton,
} from './qaap-agent-ui';
import {
    renderStickyComposerContextStrip,
    type StickyComposerContextChipView,
} from './qaap-sticky-composer-context-ui';
import {
    createStickyComposerWorkspacePill,
    renderStickyComposerWorkspaceBar,
} from './qaap-sticky-composer-workspace-bar';
import {
    createContextUsageIndicatorBadge,
} from './qaap-chat-context-usage-indicator';
import type { StickyComposerContextEntry } from '../common/qaap-composer-context-entry';
import type { AIVariableResolutionRequest } from '@theia/ai-core';
import type { MobileProjectEntry } from './mobile-projects-types';

export interface MobileProjectsStickyComposerColumnHost {
stickyComposerAgentsUi: import('./mobile-projects-sticky-composer-agents-ui').MobileProjectsStickyComposerAgentsUi;
stickyComposerWorkspaceUi: import('./mobile-projects-sticky-composer-workspace-ui').MobileProjectsStickyComposerWorkspaceUi;
resolveAttachmentPreview?: (item: AIVariableResolutionRequest) => Promise<string | undefined>;
}

export class MobileProjectsStickyComposerColumnUi {
    constructor(protected readonly host: MobileProjectsStickyComposerColumnHost) { }

    buildStickyComposerColumn(options: {
        project: MobileProjectEntry;
        surface?: QaapComposerSurface;
        agentLocked?: boolean;
        getContext: () => StickyComposerContextEntry[];
        clearContext: () => void;
        removeContextItem: (index: number) => void;
        formatContextChip: (item: StickyComposerContextEntry) => StickyComposerContextChipView;
        filesExpanded?: boolean;
        onFilesExpandedChange?: (expanded: boolean) => void;
        activityStack?: HTMLElement;
        changesPill?: HTMLElement;
        getDraft: () => string;
        setDraft: (value: string) => void;
        resolveAgentLabel: () => string;
        resolveAgentId: () => string;
        composerCwd?: string;
        modes?: readonly ChatMode[];
        resolveModeLabel?: () => string;
        onOpenModeSheet?: (anchor: HTMLButtonElement) => void;
        approvalPolicyId?: QaapAgentApprovalPolicyId;
        onOpenApprovalPolicySheet?: (anchor: HTMLButtonElement) => void;
        canSubmit: boolean;
        isAgentWorking?: () => boolean;
        onStop?: () => void;
        stopLabel?: string;
        onAttach: (anchor: HTMLElement) => void;
        onOpenAgentSheet: (anchor: HTMLButtonElement) => void;
        onSubmit: (draft: string) => void;
        onSubmitBlocked?: () => void;
        afterInputChange?: () => void;
        sendLabel?: string;
        onSendControlMounted?: (refresh: () => void) => void;
        inputPlaceholder?: string;
        getMentionOptions?: () => readonly StickyComposerTokenOption[];
        getVariableOptions?: () => readonly StickyComposerTokenOption[];
        onContextUsageBadgeMounted?: (badge: HTMLButtonElement) => void;
        onOpenContextUsageSheet?: (anchor: HTMLButtonElement) => void;
        showWorkspaceBar?: boolean;
        transcriptOverlay?: boolean;
    }): HTMLElement {
        const column = document.createElement('div');
        column.className = 'theia-mobile-projects-sticky-composer-column';
        const contextItems = options.getContext();
        if (contextItems.length > 0) {
            column.classList.add('theia-mod-has-context');
        }

        if (options.surface) {
            column.classList.add(`theia-mod-surface-${options.surface}`);
        }

        const toolbar = document.createElement('div');
        toolbar.className = 'theia-mobile-projects-sticky-composer-toolbar';

        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-projects-sticky-composer-inner';

        const attachBtn = document.createElement('button');
        attachBtn.type = 'button';
        attachBtn.className = 'theia-mobile-projects-sticky-composer-attach';
        const attachLabel = nls.localize('theia/ai/chat-ui/attachToContext', 'Attach elements to context');
        attachBtn.title = attachLabel;
        attachBtn.setAttribute('aria-label', attachLabel);
        attachBtn.innerHTML = '<span class="codicon codicon-add" aria-hidden="true"></span>';
        attachBtn.setAttribute('aria-haspopup', 'menu');
        attachBtn.setAttribute('aria-expanded', 'false');
        if (contextItems.length > 0) {
            attachBtn.classList.add('theia-mod-has-context');
        }
        attachBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            options.onAttach(attachBtn);
        });

        const controlsLeftItems: HTMLElement[] = [];
        if (options.approvalPolicyId && options.onOpenApprovalPolicySheet) {
            const approvalPolicy = resolveAgentApprovalPolicyOption(options.approvalPolicyId);
            const approvalBtn = document.createElement('button');
            approvalBtn.type = 'button';
            approvalBtn.className = 'theia-mobile-projects-sticky-composer-approval-policy';
            approvalBtn.title = nls.localize(
                'qaap/mobileProjects/stickyComposerApprovalPolicy',
                'Approval policy: {0}',
                approvalPolicy.label,
            );
            approvalBtn.setAttribute('aria-label', approvalBtn.title);
            approvalBtn.setAttribute('aria-haspopup', 'dialog');
            populateApprovalPolicyToolbarButton(approvalBtn, approvalPolicy);
            const approvalButton = approvalBtn;
            approvalBtn.addEventListener('click', ev => {
                this.openComposerControlSheet(ev, input, () => options.onOpenApprovalPolicySheet!(approvalButton));
            });
            controlsLeftItems.push(approvalBtn);
        }

        const agentBtn = document.createElement('button');
        agentBtn.type = 'button';
        agentBtn.className = 'theia-mobile-projects-sticky-composer-agent';
        const agentLabel = options.resolveAgentLabel();
        const agentId = options.resolveAgentId();
        const modelLabel = this.host.stickyComposerAgentsUi.resolveStickyComposerModelLabel(
            agentId,
            options.project,
            options.composerCwd,
        );
        agentBtn.title = modelLabel
            ? nls.localize('qaap/mobileProjects/stickyComposerAgentWithModel', 'Agent: {0}, model: {1}', agentLabel, modelLabel)
            : nls.localize('qaap/mobileProjects/stickyComposerAgent', 'Agent: {0}', agentLabel);
        agentBtn.setAttribute('aria-label', agentBtn.title);
        populateAgentToolbarButton(agentBtn, {
            agentId,
            label: agentLabel,
            modelLabel,
        });
        if (options.agentLocked) {
            agentBtn.classList.add('theia-mod-locked');
            agentBtn.disabled = true;
        }

        const toolbarItems: HTMLElement[] = [];
        const modes = options.modes ?? [];
        let modeBtn: HTMLButtonElement | undefined;
        if (modes.length > 1 && options.onOpenModeSheet && options.resolveModeLabel) {
            modeBtn = document.createElement('button');
            modeBtn.type = 'button';
            modeBtn.className = 'theia-mobile-projects-sticky-composer-mode';
            const modeLabel = options.resolveModeLabel();
            modeBtn.title = nls.localize('qaap/mobileProjects/stickyComposerMode', 'Mode: {0}', modeLabel);
            modeBtn.setAttribute('aria-label', modeBtn.title);
            modeBtn.innerHTML = `<span class="theia-mobile-projects-sticky-composer-mode-label">${modeLabel}</span>`
                + '<span class="codicon codicon-chevron-down" aria-hidden="true"></span>';
            const modeButton = modeBtn;
            modeBtn.addEventListener('click', ev => {
                this.openComposerControlSheet(ev, input, () => options.onOpenModeSheet!(modeButton));
            });
        }

        let branchWorkspaceBar: HTMLElement | undefined;
        if (options.showWorkspaceBar) {
            wrap.classList.add('theia-mod-workspace-bar-below');
            const workspaceView = this.host.stickyComposerWorkspaceUi.resolveComposerWorkspaceBarView(options.project);
            const projectPill = createStickyComposerWorkspacePill({
                iconClass: 'codicon-folder',
                label: workspaceView.projectName,
                ariaLabel: nls.localize('qaap/composerWorkspace/projectAria', 'Project: {0}', workspaceView.projectName),
                onClick: anchor => {
                    this.host.stickyComposerWorkspaceUi.openComposerWorkspaceProjectSheet(
                        options.project,
                        options.transcriptOverlay === true,
                        anchor,
                    );
                },
            });
            toolbarItems.unshift(projectPill);
            toolbar.classList.add('theia-mod-has-workspace-pill');
            branchWorkspaceBar = renderStickyComposerWorkspaceBar({
                view: workspaceView,
                includeProject: false,
                onOpenProject: anchor => {
                    this.host.stickyComposerWorkspaceUi.openComposerWorkspaceProjectSheet(
                        options.project,
                        options.transcriptOverlay === true,
                        anchor,
                    );
                },
                onOpenBranch: anchor => {
                    this.host.stickyComposerWorkspaceUi.openComposerWorkspaceBranchSheet(
                        options.project,
                        options.transcriptOverlay === true,
                        anchor,
                    );
                },
            });
        }

        toolbar.append(...toolbarItems);
        const usageBadge = createContextUsageIndicatorBadge();
        usageBadge.classList.add('theia-mobile-projects-sticky-composer-context-usage');
        const trayRight = document.createElement('div');
        trayRight.className = 'theia-mobile-projects-sticky-composer-tray-right';
        trayRight.append(agentBtn, usageBadge);
        toolbar.append(trayRight);

        const stage = document.createElement('div');
        stage.className = 'theia-mobile-projects-sticky-composer-stage';

        const inputPanel = document.createElement('div');
        inputPanel.className = 'theia-mobile-projects-sticky-composer-input-wrap theia-mobile-projects-sticky-composer-input-panel theia-mod-codex';

        const input = document.createElement('textarea');
        input.className = 'theia-mobile-projects-sticky-composer-input';
        input.rows = 1;
        const placeholderAgent = options.resolveAgentLabel();
        input.placeholder = options.inputPlaceholder ?? nls.localize(
            'qaap/mobileProjects/stickyComposerPlaceholder',
            'Message {0} on {1}',
            placeholderAgent,
            options.project.name,
        );
        input.value = options.getDraft();
        input.disabled = !options.canSubmit;

        const sendBtn = document.createElement('button');
        sendBtn.type = 'button';
        sendBtn.className = 'theia-mobile-projects-sticky-composer-send';
        sendBtn.disabled = true;
        const sendLabel = options.sendLabel ?? nls.localize('qaap/mobileProjects/inlineStart', 'Start');
        sendBtn.title = sendLabel;
        sendBtn.setAttribute('aria-label', sendLabel);
        sendBtn.innerHTML = '<span class="codicon codicon-send" aria-hidden="true"></span>';

        const updateSend = (): void => {
            const has = input.value.trim().length > 0;
            const working = options.isAgentWorking?.() ?? false;
            const showStop = working && !has;
            const sendLabel = options.sendLabel ?? nls.localize('qaap/mobileProjects/inlineStart', 'Start');
            const stopLabel = options.stopLabel ?? nls.localize('qaap/mobileProjects/cancelTaskRun', 'Cancel run');
            sendBtn.classList.toggle('theia-mod-stop', showStop);
            sendBtn.classList.toggle('theia-mod-ready', !showStop && has && options.canSubmit);
            if (showStop) {
                sendBtn.disabled = false;
                sendBtn.title = stopLabel;
                sendBtn.setAttribute('aria-label', stopLabel);
                sendBtn.innerHTML = '<span class="codicon codicon-debug-stop" aria-hidden="true"></span>';
            } else {
                sendBtn.disabled = !has || !options.canSubmit;
                sendBtn.title = sendLabel;
                sendBtn.setAttribute('aria-label', sendLabel);
                sendBtn.innerHTML = '<span class="codicon codicon-send" aria-hidden="true"></span>';
            }
        };
        input.addEventListener('input', () => {
            options.setDraft(input.value);
            options.afterInputChange?.();
            updateSend();
        });
        updateSend();
        options.onSendControlMounted?.(updateSend);

        if (options.getMentionOptions) {
            attachStickyComposerMentionUi({
                inputWrap: inputPanel,
                input,
                getMentionOptions: options.getMentionOptions,
                getVariableOptions: options.getVariableOptions,
                onDraftChange: value => {
                    options.setDraft(value);
                    updateSend();
                },
                afterInputChange: options.afterInputChange,
                mentionButtonTitle: nls.localize('qaap/mobileProjects/stickyComposerMention', 'Mention agent (@)'),
                variableButtonTitle: nls.localize('qaap/mobileProjects/stickyComposerVariable', 'Insert variable (#)'),
            });
        }

        const submit = (): void => {
            const draft = input.value.trim();
            if (!draft || !options.canSubmit) {
                options.onSubmitBlocked?.();
                return;
            }
            input.value = '';
            options.setDraft('');
            updateSend();
            options.onSubmit(draft);
        };
        input.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' && !ev.shiftKey && !ev.defaultPrevented) {
                ev.preventDefault();
                submit();
            }
        });
        sendBtn.addEventListener('click', ev => {
            ev.preventDefault();
            const has = input.value.trim().length > 0;
            const working = options.isAgentWorking?.() ?? false;
            if (working && !has) {
                options.onStop?.();
                return;
            }
            submit();
        });

        const inputActions = document.createElement('div');
        inputActions.className = 'theia-mobile-projects-sticky-composer-input-actions';
        inputActions.append(sendBtn);

        const inputBody = document.createElement('div');
        inputBody.className = 'theia-mobile-projects-sticky-composer-input-body';

        const controlsRow = document.createElement('div');
        controlsRow.className = 'theia-mobile-projects-sticky-composer-controls-row';

        const controlsLeft = document.createElement('div');
        controlsLeft.className = 'theia-mobile-projects-sticky-composer-controls-left';

        const controlsRight = document.createElement('div');
        controlsRight.className = 'theia-mobile-projects-sticky-composer-controls-right';

        inputBody.append(input);
        controlsLeft.append(attachBtn);
        if (modeBtn) {
            controlsLeft.append(modeBtn);
        }
        for (const item of controlsLeftItems) {
            controlsLeft.append(item);
        }
        if (!options.agentLocked) {
            agentBtn.addEventListener('click', ev => {
                this.openComposerControlSheet(ev, input, () => options.onOpenAgentSheet(agentBtn));
            });
        }
        if (options.onOpenContextUsageSheet) {
            usageBadge.addEventListener('click', ev => {
                this.openComposerControlSheet(ev, input, () => options.onOpenContextUsageSheet!(usageBadge));
            });
        }
        options.onContextUsageBadgeMounted?.(usageBadge);
        controlsRight.append(inputActions);
        controlsRow.append(controlsLeft, controlsRight);
        inputPanel.append(inputBody, controlsRow);
        stage.append(inputPanel, toolbar);

        const card = document.createElement('div');
        card.className = 'theia-mobile-projects-sticky-composer-card theia-mod-codex';
        if (options.changesPill) {
            wrap.append(options.changesPill);
        }
        if (contextItems.length > 0) {
            card.classList.add('theia-mod-has-context');
            card.append(renderStickyComposerContextStrip({
                items: contextItems,
                formatChip: options.formatContextChip,
                onRemoveItem: index => { options.removeContextItem(index); },
                onClearAll: () => { options.clearContext(); },
                filesExpanded: options.filesExpanded,
                onFilesExpandedChange: options.onFilesExpandedChange,
                resolveAttachmentPreview: this.host.resolveAttachmentPreview,
            }));
        }
        toolbar.classList.add('qaap-codex-context-tray');
        if (options.activityStack) {
            card.classList.add('theia-mod-has-activity');
            card.append(options.activityStack);
        }
        card.append(stage);
        this.installCodexComposerExpandBehavior(card, stage, inputBody, input);
        wrap.append(card);
        if (branchWorkspaceBar) {
            wrap.append(branchWorkspaceBar);
            void this.host.stickyComposerWorkspaceUi.refreshComposerWorkspaceBranch(options.project).then(branch => {
                const label = branchWorkspaceBar!.querySelector('.theia-mobile-projects-sticky-composer-workspace-pill-label.theia-mod-mono');
                if (label) {
                    label.textContent = branch;
                }
            });
        }
        column.append(wrap);
        return column;
    }

    /** Blur textarea before opening a bottom sheet so tray state and hit targets stay consistent. */
    protected openComposerControlSheet(ev: Event, input: HTMLTextAreaElement, open: () => void): void {
        ev.preventDefault();
        ev.stopPropagation();
        if (document.activeElement === input) {
            input.blur();
        }
        open();
    }

    /**
     * Codex lip: the input panel (textarea + controls) stays fixed. Only the context tray slides
     * behind the panel on focus; blur brings the tray back.
     */
    protected installCodexComposerExpandBehavior(
        card: HTMLElement,
        _stage: HTMLElement,
        inputBody: HTMLElement,
        input: HTMLTextAreaElement,
    ): void {
        const syncExpanded = (): void => {
            card.classList.toggle('theia-mod-input-expanded', document.activeElement === input);
        };

        const expandFromTextarea = (): void => {
            card.classList.add('theia-mod-input-expanded');
        };

        input.addEventListener('focus', expandFromTextarea);
        input.addEventListener('click', expandFromTextarea);
        input.addEventListener('blur', () => {
            window.requestAnimationFrame(syncExpanded);
        });
        inputBody.addEventListener('click', () => {
            if (document.activeElement !== input) {
                input.focus();
            }
            expandFromTextarea();
        });
    }
}

export type StickyComposerColumnOptions = Parameters<MobileProjectsStickyComposerColumnUi['buildStickyComposerColumn']>[0];

