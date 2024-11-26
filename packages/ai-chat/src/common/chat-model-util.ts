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
import { ChatProgressMessage, ChatRequestModel, ChatResponse, ChatResponseContent, ChatResponseModel, QuestionResponseContent } from './chat-model';

export function lastResponseContent(request: ChatRequestModel): ChatResponseContent | undefined {
    return lastContentOfResponse(request.response?.response);
}

export function lastContentOfResponse(response: ChatResponse | undefined): ChatResponseContent | undefined {
    const content = response?.content;
    return content && content.length > 0 ? content[content.length - 1] : undefined;
}

export function lastProgressMessage(request: ChatRequestModel): ChatProgressMessage | undefined {
    return lastProgressMessageOfResponse(request.response);
}

export function lastProgressMessageOfResponse(response: ChatResponseModel | undefined): ChatProgressMessage | undefined {
    const progressMessages = response?.progressMessages;
    return progressMessages && progressMessages.length > 0 ? progressMessages[progressMessages.length - 1] : undefined;
}

export function unansweredQuestions(request: ChatRequestModel): QuestionResponseContent[] {
    const response = request.response;
    return unansweredQuestionsOfResponse(response);
}

function unansweredQuestionsOfResponse(response: ChatResponseModel | undefined): QuestionResponseContent[] {
    if (!response || !response.response) { return []; }
    return response.response.content.filter((c): c is QuestionResponseContent => QuestionResponseContent.is(c) && c.selectedOption === undefined);
}
