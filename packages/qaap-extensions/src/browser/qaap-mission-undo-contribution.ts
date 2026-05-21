// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { ChatService } from '@theia/ai-chat/lib/common';
import { ChangeSetElement } from '@theia/ai-chat/lib/common/change-set';
import URI from '@theia/core/lib/common/uri';

const QAAP_LAST_MISSION_STORAGE_KEY = 'qaap.ai.lastMissionSnapshot';

export const QAAP_UNDO_LAST_MISSION_COMMAND_ID = 'qaap.ai.undoLastMission';
export const QAAP_CAPTURE_MISSION_SNAPSHOT_COMMAND_ID = 'qaap.ai.captureMissionSnapshot';

export namespace QaapMissionUndoCommands {
    export const UNDO_LAST: Command = {
        id: QAAP_UNDO_LAST_MISSION_COMMAND_ID,
        category: 'AI',
        label: nls.localize('qaap/missionUndo/undo', 'Undo last agent mission'),
    };
    export const CAPTURE: Command = {
        id: QAAP_CAPTURE_MISSION_SNAPSHOT_COMMAND_ID,
        category: 'AI',
        label: nls.localize('qaap/missionUndo/capture', 'Capture mission snapshot'),
    };
}

interface QaapMissionSnapshot {
    readonly sessionLabel: string;
    readonly capturedAt: string;
    readonly sessionId?: string;
    readonly fileUris: string[];
}

/** Reverts the last captured agent mission via chat change-set {@link ChangeSetElement.revert}. */
@injectable()
export class QaapMissionUndoContribution implements CommandContribution {

    @inject(StorageService)
    protected readonly storage: StorageService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(QaapMissionUndoCommands.UNDO_LAST, {
            execute: () => this.undoLastMission(),
        });
        registry.registerCommand(QaapMissionUndoCommands.CAPTURE, {
            execute: (label?: string, elements?: ChangeSetElement[]) => this.captureMissionSnapshot(label, elements),
        });
    }

    async captureMissionSnapshot(
        sessionLabel = 'Agent session',
        elements?: ChangeSetElement[],
    ): Promise<void> {
        const active = this.chatService.getActiveSession();
        const changeElements = elements ?? active?.model.changeSet.getElements() ?? [];
        const snapshot: QaapMissionSnapshot = {
            sessionLabel,
            capturedAt: new Date().toISOString(),
            sessionId: active?.id,
            fileUris: changeElements.map(e => e.uri.toString()),
        };
        await this.storage.setData(QAAP_LAST_MISSION_STORAGE_KEY, snapshot);
    }

    protected async undoLastMission(): Promise<void> {
        const snapshot = await this.storage.getData<QaapMissionSnapshot>(QAAP_LAST_MISSION_STORAGE_KEY);
        if (!snapshot?.fileUris?.length) {
            this.messages.info(nls.localize(
                'qaap/missionUndo/none',
                'No mission snapshot yet. Run an agent edit first — changes are captured automatically.'
            ));
            return;
        }
        const session = snapshot.sessionId
            ? this.chatService.getSession(snapshot.sessionId)
            : this.chatService.getActiveSession();
        if (!session) {
            this.messages.warn(nls.localize(
                'qaap/missionUndo/sessionGone',
                'The chat session for this mission is no longer open.'
            ));
            return;
        }
        let reverted = 0;
        for (const uriString of snapshot.fileUris) {
            const uri = new URI(uriString);
            const element = session.model.changeSet.getElementByURI(uri);
            if (element?.revert) {
                try {
                    await element.revert();
                    reverted++;
                } catch (err) {
                    console.warn('[qaap-mission-undo] revert failed for', uriString, err);
                }
            }
        }
        await this.storage.setData(QAAP_LAST_MISSION_STORAGE_KEY, undefined);
        if (reverted > 0) {
            this.messages.info(nls.localize(
                'qaap/missionUndo/reverted',
                'Reverted {0} file(s) from mission "{1}".',
                String(reverted),
                snapshot.sessionLabel
            ));
        } else {
            this.messages.warn(nls.localize(
                'qaap/missionUndo/noRevertible',
                'No pending agent edits could be reverted. Files may already be applied or removed from the change set.'
            ));
        }
    }
}
