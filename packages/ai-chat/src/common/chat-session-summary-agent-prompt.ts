/* eslint-disable @typescript-eslint/tslint/config  */
// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
//
// This file is licensed under the MIT License.
// See LICENSE-MIT.txt in the project root for license information.
// https://opensource.org/license/mit.
//
// SPDX-License-Identifier: MIT

import { CHANGE_SET_SUMMARY_VARIABLE_ID } from './context-variables';

export const CHAT_SESSION_SUMMARY_PROMPT = {
    id: 'chat-session-summary-system',
    defaultVariant: {
        id: 'chat-session-summary-system-default',
        template: '{{!-- !-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).\n' +
            'Made improvements or adaptations to this prompt template? We\'d love for you to share it with the community! Contribute back here:  ' +
            'https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}\n\n' +
            'You are a chat agent for summarizing AI agent chat sessions for later use. ' +
            'Review the conversation above and generate a concise summary that captures every crucial detail, ' +
            'including all requirements, decisions, and pending tasks. ' +
            'Ensure that the summary is sufficiently comprehensive to allow seamless continuation of the workflow. ' +
            'The summary will primarily be used by other AI agents, so tailor your response for use by AI agents. ' +
            'Also consider the system message. ' +
            'Make sure you include all necessary context information and use unique references (such as URIs, file paths, etc.). ' +
            'If the conversation was about a task, describe the state of the task, i.e.what has been completed and what is open. ' +
            'If a changeset is open in the session, describe the state of the suggested changes. ' +
            `\n\n{{${CHANGE_SET_SUMMARY_VARIABLE_ID}}}`,
    }
};
