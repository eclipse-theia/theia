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
import { useMarkdownRendering } from './chat-response-renderer';
import { OpenerService } from '@theia/core/lib/browser';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';

interface ChatInputAgentSuggestionsProps {
    suggestions: (string | MarkdownString)[];
    opener: OpenerService;
}

export const ChatInputAgentSuggestions: React.FC<ChatInputAgentSuggestionsProps> = ({suggestions, opener}) => (
    <div className="chat-agent-suggestions">
        {suggestions.map(suggestion => <ChatInputAgentSuggestion key={typeof suggestion === 'string' ? suggestion : suggestion.value} suggestion={suggestion} opener={opener}/>)}
    </div>
);

interface ChatInputAgestSuggestionProps {
    suggestion: string | MarkdownString;
    opener: OpenerService;
}

const ChatInputAgentSuggestion: React.FC<ChatInputAgestSuggestionProps> = ({suggestion, opener}) => {
    const ref = useMarkdownRendering(suggestion, opener, true);
    return <div className="chat-agent-suggestion" ref={ref}/>;
};
