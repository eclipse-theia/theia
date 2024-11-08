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

import { Event } from '@theia/core';

export type CommunicationHistory = CommunicationHistoryEntry[];

export interface CommunicationHistoryEntry {
    agentId: string;
    sessionId: string;
    timestamp: number;
    requestId: string;
    request?: string;
    response?: string;
    responseTime?: number;
    systemMessage?: string;
    messages?: unknown[];
}

export type CommunicationRequestEntry = Omit<CommunicationHistoryEntry, 'response' | 'responseTime'>;
export type CommunicationResponseEntry = Omit<CommunicationHistoryEntry, 'request'>;

export type CommunicationRequestEntryParam = Omit<CommunicationRequestEntry, 'timestamp'> & Partial<Pick<CommunicationHistoryEntry, 'timestamp'>>;
export type CommunicationResponseEntryParam = Omit<CommunicationResponseEntry, 'timestamp'> & Partial<Pick<CommunicationHistoryEntry, 'timestamp'>>;

export const CommunicationRecordingService = Symbol('CommunicationRecordingService');
export interface CommunicationRecordingService {
    recordRequest(requestEntry: CommunicationRequestEntryParam): void;
    readonly onDidRecordRequest: Event<CommunicationRequestEntry>;

    recordResponse(responseEntry: CommunicationResponseEntryParam): void;
    readonly onDidRecordResponse: Event<CommunicationResponseEntry>;

    getHistory(agentId: string): CommunicationHistory;

    getSessionHistory(sessionId: string): CommunicationHistory;

    clearHistory(): void;
    readonly onStructuralChange: Event<void>;
}
