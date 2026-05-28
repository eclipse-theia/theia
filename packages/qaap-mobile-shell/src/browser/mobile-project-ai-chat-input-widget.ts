// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import URI from '@theia/core/lib/common/uri';
import { ChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import { GenericCapabilitySelections } from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { PanelLayout } from '@lumino/widgets';
import { ChatAgentLocation, ChatRequestModel, ChatSession } from '@theia/ai-chat';
import { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import { postConstruct } from '@theia/core/shared/inversify';
import { THEIA_CODER_AGENT_ID } from '../common/qaap-agent-task-client';

export const MobileProjectChatViewWidgetFactory = Symbol('MobileProjectChatViewWidgetFactory');
export type MobileProjectChatViewWidgetFactory = (id: string) => MobileProjectChatViewWidget;

/**
 * {@link ChatViewWidget} for the mobile Projects transcript sheet.
 *
 * The upstream widget always calls {@link ChatService.createSession} in `postConstruct`, which
 * steals the active session and leaves the transcript bound to an empty model — the sheet then
 * stays on "Loading…" or renders blank. This subclass reuses the already-active transcript session
 * (set by {@link MobileProjectsPanel} before mount) and exposes {@link bindTranscriptSession} to
 * re-sync after each fetch.
 */
@injectable()
export class MobileProjectChatViewWidget extends ChatViewWidget {

    @postConstruct()
    protected override init(): void {
        this.toDispose.pushAll([
            this.treeWidget,
            this.inputWidget,
            this.onStateChanged(newState => {
                const shouldScrollToEnd = !newState.locked && !newState.temporaryLocked;
                this.treeWidget.shouldScrollToEnd = shouldScrollToEnd;
                this.update();
            }),
        ]);
        const layout = this.layout = new PanelLayout();
        this.treeWidget.node.classList.add('chat-tree-view-widget');
        layout.addWidget(this.treeWidget);
        this.inputWidget.node.classList.add('chat-input-widget');
        layout.addWidget(this.inputWidget);

        const active = this.chatService.getActiveSession();
        this.chatSession = active ?? this.chatService.createSession(ChatAgentLocation.Panel, { focus: false });
        this.inputWidget.onQuery = this.onQuery.bind(this);
        this.inputWidget.onUnpin = this.onUnpin.bind(this);
        this.inputWidget.onCancel = this.onCancel.bind(this);
        this.inputWidget.chatModel = this.chatSession.model;
        this.inputWidget.pinnedAgent = this.chatSession.pinnedAgent;
        this.inputWidget.onDeleteChangeSet = this.onDeleteChangeSet.bind(this);
        this.inputWidget.onDeleteChangeSetElement = this.onDeleteChangeSetElement.bind(this);
        this.treeWidget.trackChatModel(this.chatSession.model);
        this.treeWidget.onScrollLockChange = this.onScrollLockChange.bind(this);

        this.initListeners();
        void this.updateInputEnabledState();
        this.activationService.onDidChangeCanRun(change => {
            this.treeWidget.setEnabled(change);
            void this.updateInputEnabledState();
            this.update();
        });
        this.toDispose.push(
            this.languageModelRegistry.onChange(() => {
                void this.updateInputEnabledState();
            }),
        );
        for (const provider of this.welcomeMessageProviders.getContributions()) {
            if (provider.onStateChanged) {
                this.toDispose.push(provider.onStateChanged(() => {
                    void this.updateInputEnabledState();
                    this.update();
                }));
            }
        }
        this.toDispose.push(this.progressBarFactory({ container: this.node, insertMode: 'prepend', locationId: 'ai-chat' }));
    }

    bindTranscriptSession(session: ChatSession): void {
        this.chatSession = session;
        this.treeWidget.trackChatModel(session.model);
        this.inputWidget.chatModel = session.model;
        this.inputWidget.pinnedAgent = session.pinnedAgent;
        this.update();
    }
}

/**
 * AIChatInputWidget variant used by the mobile Projects panel.
 *
 * The vanilla {@link AIChatInputWidget} hard-codes its `resources.add(...)` URI to
 * `ai-chat:/input.aichatviewlanguage`. The workspace Agent AI view already registers an
 * AIChatInputWidget with that key, so any second instance constructed in the same process
 * throws "Cannot add already existing in-memory resource" inside `postConstruct` — which we
 * traced as the cause of the empty agent-input card the user kept hitting when expanding the
 * tune button in a project row.
 *
 * Overriding {@link getResourceUri} with a per-instance unique URI removes the collision
 * without touching the upstream widget. Everything else (mode picker, capability chips, tools
 * toggle, model selector, React render tree) is inherited verbatim so the chrome the user sees
 * in the project card is identical to the workspace ChatView.
 */
@injectable()
export class MobileProjectAIChatInputWidget extends AIChatInputWidget {

    private static instanceCounter = 0;
    private readonly mobileInstanceSeq = ++MobileProjectAIChatInputWidget.instanceCounter;

    protected override getResourceUri(): URI {
        return new URI(`ai-chat:/mobile-projects-input-${this.mobileInstanceSeq}.aichatviewlanguage`);
    }

    /**
     * Sticky tools sheet and other standalone mounts are not children of {@link ChatViewWidget},
     * so parent wiring for `onUnpin` / `onCancel` / change-set handlers never runs. Upstream
     * {@link AIChatInputWidget.render} binds those handlers unconditionally and throws otherwise.
     */
    ensureStandaloneInputCallbacks(): void {
        if (!this._onQuery) {
            this.onQuery = async () => { /* submit handled outside this widget */ };
        }
        if (!this._onUnpin) {
            this.onUnpin = () => { /* standalone mount */ };
        }
        if (!this._onCancel) {
            this.onCancel = (_requestModel: ChatRequestModel) => { /* standalone mount */ };
        }
        if (!this._onDeleteChangeSet) {
            this.onDeleteChangeSet = (_requestModel: ChatRequestModel) => { /* standalone mount */ };
        }
        if (!this._onDeleteChangeSetElement) {
            this.onDeleteChangeSetElement = (_requestModel: ChatRequestModel, _index: number) => { /* standalone mount */ };
        }
    }

    protected override render(): React.ReactNode {
        if (!this._chatModel) {
            return null;
        }
        this.ensureStandaloneInputCallbacks();
        return super.render();
    }

    /** Capability overrides chosen in the tools sheet (used by the mobile sticky composer). */
    getCapabilityOverridesForSubmit(): Record<string, boolean> | undefined {
        if (this.userCapabilityOverrides.size === 0) {
            return undefined;
        }
        const record: Record<string, boolean> = {};
        for (const [key, value] of this.userCapabilityOverrides) {
            record[key] = value;
        }
        return record;
    }

    getGenericCapabilitySelectionsForSubmit(): GenericCapabilitySelections | undefined {
        return GenericCapabilitySelections.hasSelections(this.genericCapabilitySelections)
            ? this.genericCapabilitySelections
            : undefined;
    }

    /**
     * Collapse the capabilities panel when the mobile tools sheet is removed from the DOM.
     * The sticky host hides the collapsed bar via CSS; leaving {@link capabilitiesOpen} true
     * across dismiss/reopen skips {@link prepareToolsSheet}'s expand step and shows a blank sheet.
     */
    stashToolsSheetPresentation(): void {
        if (this.capabilitiesOpen) {
            this.capabilitiesOpen = false;
            this.update();
        }
    }

    /**
     * Load capability chips / generic tools for the pinned agent and expand the panel.
     * Bypasses {@link AIChatInputWidget.updateReceivingAgent}, which needs a Monaco editor ref
     * that may not exist yet in the mobile tools sheet.
     */
    async prepareToolsSheet(): Promise<void> {
        this.ensureStandaloneInputCallbacks();
        if (!this._chatModel) {
            return;
        }
        const agent: ChatAgent | undefined = this._pinnedAgent
            ?? this.chatAgentService.getDefaultAgent()
            ?? this.chatAgentService.getAgent(THEIA_CODER_AGENT_ID);
        if (!agent) {
            return;
        }
        this.forceCapabilitiesRefresh = true;
        await this.updateAgentState(agent);
        // postConstruct loads this asynchronously once; re-fetch when opening the mobile sheet
        // or the expanded panel renders empty (GenericCapabilitiesSection returns null).
        await this.updateAvailableGenericCapabilities();
        this.capabilitiesOpen = true;
        this.update();
    }

    hasVisibleToolsContent(): boolean {
        if (this.capabilityDefaults.length > 0) {
            return true;
        }
        const available = this.availableGenericCapabilities;
        return available.skills.length > 0
            || available.mcpFunctions.length > 0
            || available.functions.length > 0
            || available.promptFragments.length > 0
            || available.agentDelegation.length > 0
            || available.variables.length > 0;
    }

    /** Persist capability overrides and generic selections (sticky composer Done). */
    async saveToolsSheetSelectionsToSettings(): Promise<void> {
        await this.saveCurrentSelectionsToSettings();
    }

    getComposerModeId(): string | undefined {
        return this.receivingAgent?.currentModeId;
    }

    /** Keep tools/capabilities in sync when the sticky composer mode chip changes. */
    async applyComposerMode(modeId: string): Promise<void> {
        if (!this.receivingAgent?.modes?.some(mode => mode.id === modeId)) {
            return;
        }
        await this.handleModeChange(modeId);
    }
}
