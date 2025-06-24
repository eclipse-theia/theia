// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import * as React from '@theia/core/shared/react';
import { DeclaredEventsEventListenerObject, useMarkdownRendering } from './chat-response-renderer/markdown-part-renderer';
import { OpenerService } from '@theia/core/lib/browser';
import { ChatSuggestion, ChatSuggestionCallback } from '@theia/ai-chat';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';

interface ChatInputAgentSuggestionsProps {
    suggestions: readonly ChatSuggestion[];
    opener: OpenerService;
}

function getText(suggestion: ChatSuggestion): string {
    if (typeof suggestion === 'string') { return suggestion; }
    if ('value' in suggestion) { return suggestion.value; }
    if (typeof suggestion.content === 'string') { return suggestion.content; }
    return suggestion.content.value;
}

function getContent(suggestion: ChatSuggestion): string | MarkdownString {
    if (typeof suggestion === 'string') { return suggestion; }
    if ('value' in suggestion) { return suggestion; }
    return suggestion.content;
}

export const ChatInputAgentSuggestions: React.FC<ChatInputAgentSuggestionsProps> = ({ suggestions, opener }) => (
    !!suggestions?.length && <div className="chat-agent-suggestions">
        {suggestions.map(suggestion => <ChatInputAgentSuggestion
            key={getText(suggestion)}
            suggestion={suggestion}
            opener={opener}
            handler={ChatSuggestionCallback.is(suggestion) ? new ChatSuggestionClickHandler(suggestion) : undefined}
        />)}
    </div>
);

interface ChatInputAgestSuggestionProps {
    suggestion: ChatSuggestion;
    opener: OpenerService;
    handler?: DeclaredEventsEventListenerObject;
}

const ChatInputAgentSuggestion: React.FC<ChatInputAgestSuggestionProps> = ({ suggestion, opener, handler }) => {
    const ref = useMarkdownRendering(getContent(suggestion), opener, true, handler);
    return <div className="chat-agent-suggestion" style={(!handler || ChatSuggestionCallback.containsCallbackLink(suggestion)) ? undefined : { cursor: 'pointer' }} ref={ref} />;
};

class ChatSuggestionClickHandler implements DeclaredEventsEventListenerObject {
    constructor(protected readonly suggestion: ChatSuggestionCallback) { }
    handleEvent(event: Event): boolean {
        const { target, currentTarget } = event;
        if (event.type !== 'click' || !(target instanceof Element)) { return false; }
        const link = target.closest('a[href^="_callback"]');
        if (link) {
            this.suggestion.callback();
            return true;
        }
        if (!(currentTarget instanceof Element)) {
            this.suggestion.callback();
            return true;
        }
        const containedLink = currentTarget.querySelector('a[href^="_callback"]');
        // Whole body should count.
        if (!containedLink) {
            this.suggestion.callback();
            return true;
        }
        return false;
    }
}
