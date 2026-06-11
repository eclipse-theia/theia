// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import {
    ChatAgentService, ChatRequestModel, ChatResponseContent, ChatSession, ChatSessionMetadata,
    ErrorChatResponseContent, FormattedProviderError, formatProviderError, ThinkingChatResponseContent
} from '@theia/ai-chat';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { nls } from '@theia/core/lib/common/nls';
import { formatTimeAgo } from '@theia/ai-chat-ui/lib/browser/chat-date-utils';

const TOOLTIP_SNIPPET_MAX_LENGTH = 1000;

/** Read an error message from a completed-with-error response, if any. */
function getResponseErrorMessage(response: ChatRequestModel['response']): string | undefined {
    if (response.errorObject?.message) {
        return response.errorObject.message;
    }
    const errorPart = response.response.content.find(ErrorChatResponseContent.is);
    return errorPart?.asDisplayString?.();
}

/**
 * Build a DOM fragment that renders a {@link FormattedProviderError} for the tooltip.
 * Details are intentionally omitted: the hover popup is not interactive, so a
 * <details> expander wouldn't work. The full payload is available in the chat output.
 */
function renderFormattedProviderError(error: FormattedProviderError): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'theia-chat-session-tooltip-error';
    const prefix = document.createElement('span');
    prefix.className = 'theia-chat-session-tooltip-error-prefix';
    prefix.textContent = error.status
        ? `${nls.localizeByDefault('Error')} ${error.status}:`
        : `${nls.localizeByDefault('Error')}:`;
    wrapper.appendChild(prefix);
    const headline = error.message.length > TOOLTIP_SNIPPET_MAX_LENGTH
        ? error.message.substring(0, TOOLTIP_SNIPPET_MAX_LENGTH) + '…'
        : error.message;
    wrapper.appendChild(document.createTextNode(' ' + headline));
    return wrapper;
}

/** Collect display text from response content, excluding thinking parts. */
function responseToTooltipString(content: ChatResponseContent[]): string {
    return content
        .filter(c => !ThinkingChatResponseContent.is(c))
        .map(c => {
            if (ChatResponseContent.hasAsString(c)) {
                return c.asString();
            }
            return undefined;
        })
        .filter((text): text is string => text !== undefined && text !== '')
        .join('\n\n');
}

function addDlEntry(dl: HTMLDListElement, term: string, detail: string): void {
    const dt = document.createElement('dt');
    dt.textContent = term;
    dl.appendChild(dt);
    const dd = document.createElement('dd');
    dd.textContent = detail;
    dl.appendChild(dd);
}

export function buildSessionTooltip(
    session: ChatSession, metadata: ChatSessionMetadata,
    agentService: ChatAgentService, markdownRenderer: MarkdownRenderer,
    isUnread: boolean, isRunning: boolean, hasError: boolean
): HTMLElement {
    const requests = session.model.getRequests();
    const lastRequest = requests.at(-1);

    const container = document.createElement('div');
    container.className = 'theia-chat-session-tooltip';

    if (isRunning) {
        const badge = document.createElement('div');
        badge.className = 'theia-chat-session-badge-running-tooltip';
        badge.textContent = nls.localizeByDefault('Running');
        container.appendChild(badge);
    } else if (hasError) {
        const badge = document.createElement('div');
        badge.className = 'theia-chat-session-badge-error-tooltip';
        badge.textContent = nls.localizeByDefault('Error');
        container.appendChild(badge);
    } else if (isUnread) {
        const badge = document.createElement('div');
        badge.className = 'theia-chat-session-badge-unread-tooltip';
        badge.textContent = nls.localize('theia/ai/ide/tooltip/unread', 'Unread');
        container.appendChild(badge);
    }

    if (lastRequest) {
        const lastResponse = lastRequest.response;
        const errorText = hasError ? getResponseErrorMessage(lastResponse) : undefined;

        if (errorText) {
            const label = document.createElement('div');
            label.className = 'theia-chat-session-tooltip-label';
            label.textContent = nls.localize('theia/ai/ide/tooltip/errorMessage', 'Error message');
            container.appendChild(label);
            container.appendChild(renderFormattedProviderError(formatProviderError(errorText)));

            const hr = document.createElement('hr');
            container.appendChild(hr);
        } else {
            const messageText = lastResponse.isComplete
                ? (responseToTooltipString(lastResponse.response.content) || undefined)
                : (lastRequest.request.text || undefined);

            if (messageText) {
                const snippet = messageText.length > TOOLTIP_SNIPPET_MAX_LENGTH
                    ? messageText.substring(0, TOOLTIP_SNIPPET_MAX_LENGTH) + '…'
                    : messageText;
                const label = document.createElement('div');
                label.className = 'theia-chat-session-tooltip-label';
                label.textContent = nls.localize('theia/ai/ide/tooltip/lastMessage', 'Last message');
                container.appendChild(label);

                const snippetEl = document.createElement('div');
                snippetEl.className = 'theia-chat-session-tooltip-snippet';
                snippetEl.appendChild(markdownRenderer.render({ value: snippet }).element);
                container.appendChild(snippetEl);

                const hr = document.createElement('hr');
                container.appendChild(hr);
            }
        }
    }

    const dl = document.createElement('dl');

    if (lastRequest) {
        const agentId = lastRequest.response.agentId ?? requests.findLast(r => r.response.agentId)?.response.agentId;
        if (agentId) {
            const agentName = agentService.getAgent(agentId)?.name ?? agentId;
            addDlEntry(dl, nls.localizeByDefault('Agent'), '@' + agentName);
        }
    }

    const count = requests.length;
    const exchangeLabel = count === 1
        ? nls.localize('theia/ai/ide/tooltip/oneExchange', '1 exchange')
        : nls.localize('theia/ai/ide/tooltip/multipleExchanges', '{0} exchanges', count);
    addDlEntry(dl, nls.localize('theia/ai/ide/tooltip/messages', 'Messages'), exchangeLabel);

    const date = session.lastInteraction ?? new Date(metadata.saveDate);
    addDlEntry(dl, nls.localize('theia/ai/ide/tooltip/lastActivity', 'Last activity'), date.toLocaleString());

    container.appendChild(dl);
    return container;
}

/**
 * Build a tooltip for a session that hasn't been loaded yet (i.e. a restored / persisted entry
 * shown on the home view). Avoids any restore I/O so hover does not promote the row to Active.
 */
export function buildRestoredSessionTooltip(
    metadata: ChatSessionMetadata, agentService: ChatAgentService
): HTMLElement {
    const container = document.createElement('div');
    container.className = 'theia-chat-session-tooltip';

    const badge = document.createElement('div');
    badge.className = 'theia-chat-session-badge-restored-tooltip';
    badge.textContent = nls.localize('theia/ai/ide/restoredSession', 'Restored session');
    container.appendChild(badge);

    const dl = document.createElement('dl');

    if (metadata.pinnedAgentId) {
        const agentName = agentService.getAgent(metadata.pinnedAgentId)?.name ?? metadata.pinnedAgentId;
        addDlEntry(dl, nls.localizeByDefault('Agent'), '@' + agentName);
    }

    const date = new Date(metadata.saveDate);
    addDlEntry(dl, nls.localize('theia/ai/ide/tooltip/lastActivity', 'Last activity'),
        `${date.toLocaleString()} (${formatTimeAgo(metadata.saveDate)})`);

    container.appendChild(dl);
    return container;
}
