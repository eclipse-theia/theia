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

import { CommunicationRequestEntryParam, CommunicationResponseEntryParam } from '@theia/ai-core/lib/common/communication-recording-service';
import { ChatRequestModel } from './chat-model';

export namespace ChatHistoryEntry {
    export function fromRequest(
        agentId: string,
        request: ChatRequestModel,
        args: Partial<CommunicationRequestEntryParam> = {}
    ): CommunicationRequestEntryParam {
        return {
            agentId: agentId,
            sessionId: request.session.id,
            requestId: request.id,
            request: request.request.text,
            ...args,
        };
    }
    export function fromResponse(
        agentId: string,
        request: ChatRequestModel,
        args: Partial<CommunicationResponseEntryParam> = {}
    ): CommunicationResponseEntryParam {
        return {
            agentId: agentId,
            sessionId: request.session.id,
            requestId: request.id,
            response: request.response.response.asString(),
            ...args,
        };
    }
}
