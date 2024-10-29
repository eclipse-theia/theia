// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
import { CommunicationHistory, CommunicationHistoryEntry, CommunicationRecordingService, CommunicationRequestEntry, CommunicationResponseEntry } from '@theia/ai-core';
import { Emitter, Event, ILogger } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';

@injectable()
export class DefaultCommunicationRecordingService implements CommunicationRecordingService {

    @inject(ILogger) @named('llm-communication-recorder')
    protected logger: ILogger;

    protected onDidRecordRequestEmitter = new Emitter<CommunicationRequestEntry>();
    readonly onDidRecordRequest: Event<CommunicationRequestEntry> = this.onDidRecordRequestEmitter.event;

    protected onDidRecordResponseEmitter = new Emitter<CommunicationResponseEntry>();
    readonly onDidRecordResponse: Event<CommunicationResponseEntry> = this.onDidRecordResponseEmitter.event;

    protected onStructuralChangeEmitter = new Emitter<void>();
    readonly onStructuralChange: Event<void> = this.onStructuralChangeEmitter.event;

    protected history: Map<string, CommunicationHistory> = new Map();

    getHistory(agentId: string): CommunicationHistory {
        return this.history.get(agentId) || [];
    }

    recordRequest(requestEntry: CommunicationHistoryEntry): void {
        this.logger.debug('Recording request:', requestEntry.request);
        if (this.history.has(requestEntry.agentId)) {
            this.history.get(requestEntry.agentId)?.push(requestEntry);
        } else {
            this.history.set(requestEntry.agentId, [requestEntry]);
        }
        this.onDidRecordRequestEmitter.fire(requestEntry);
    }

    recordResponse(responseEntry: CommunicationHistoryEntry): void {
        this.logger.debug('Recording response:', responseEntry.response);
        if (this.history.has(responseEntry.agentId)) {
            const entry = this.history.get(responseEntry.agentId);
            if (entry) {
                const matchingRequest = entry.find(e => e.requestId === responseEntry.requestId);
                if (!matchingRequest) {
                    throw Error('No matching request found for response');
                }
                matchingRequest.response = responseEntry.response;
                matchingRequest.responseTime = responseEntry.timestamp - matchingRequest.timestamp;
                this.onDidRecordResponseEmitter.fire(responseEntry);
            }
        }
    }

    clearHistory(): void {
        this.history.clear();
        this.onStructuralChangeEmitter.fire(undefined);
    }
}
