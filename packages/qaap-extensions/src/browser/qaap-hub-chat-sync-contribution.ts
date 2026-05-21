// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import {
    ChatService,
    isActiveSessionChangedEvent,
    isSessionCreatedEvent,
    type ChatSession,
} from '@theia/ai-chat/lib/common';
import { ChangeSetElement } from '@theia/ai-chat/lib/common/change-set';
import { MobileProjectsService } from '@theia/qaap-mobile-shell/lib/browser/mobile-projects-service';
import {
    QAAP_CAPTURE_MISSION_SNAPSHOT_COMMAND_ID,
} from './qaap-mission-undo-contribution';
import { CommandRegistry } from '@theia/core/lib/common/command';

/**
 * Mirrors agent activity into the projects hub and captures mission snapshots when the chat change set updates.
 */
@injectable()
export class QaapHubChatSyncContribution implements FrontendApplicationContribution {

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(MobileProjectsService)
    protected readonly hubProjects: MobileProjectsService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    protected readonly toDispose = new DisposableCollection();
    protected readonly sessionDisposables = new Map<string, DisposableCollection>();

    onStart(): void {
        this.toDispose.push(this.chatService.onSessionEvent(event => {
            if (isSessionCreatedEvent(event)) {
                const session = this.chatService.getSession(event.sessionId);
                if (session) {
                    this.watchSession(session);
                }
            } else if (isActiveSessionChangedEvent(event) && event.sessionId) {
                const session = this.chatService.getSession(event.sessionId);
                if (session) {
                    this.watchSession(session);
                }
            }
        }));
        for (const session of this.chatService.getSessions()) {
            this.watchSession(session);
        }
    }

    onStop(): void {
        this.toDispose.dispose();
        for (const disposables of this.sessionDisposables.values()) {
            disposables.dispose();
        }
        this.sessionDisposables.clear();
    }

    protected watchSession(session: ChatSession): void {
        if (this.sessionDisposables.has(session.id)) {
            return;
        }
        const disposables = new DisposableCollection();
        disposables.push(session.model.changeSet.onDidChange(() => {
            void this.onChangeSetUpdated(session);
        }));
        this.sessionDisposables.set(session.id, disposables);
        this.toDispose.push(disposables);
    }

    protected async onChangeSetUpdated(session: ChatSession): Promise<void> {
        const elements = session.model.changeSet.getElements();
        const lastRequest = session.model.getRequests().at(-1);
        const taskSnippet = lastRequest?.request.text?.trim().slice(0, 200);
        void this.hubProjects.recordProjectSession({
            agentState: elements.length > 0 ? 'working' : 'idle',
            lastTask: taskSnippet || undefined,
        });
        if (elements.length === 0) {
            return;
        }
        await this.captureMissionFromChangeSet(session, elements);
    }

    protected async captureMissionFromChangeSet(
        session: ChatSession,
        elements: ChangeSetElement[],
    ): Promise<void> {
        const label = session.title?.trim() || 'Agent session';
        try {
            await this.commands.executeCommand(QAAP_CAPTURE_MISSION_SNAPSHOT_COMMAND_ID, label, elements);
        } catch {
            /* capture is best-effort */
        }
    }
}
