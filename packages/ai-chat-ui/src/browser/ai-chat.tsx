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
import * as React from '@theia/core/shared/react';
import { codicon } from '@theia/core/lib/browser';
import { ChatActor, ChatMessage } from '@theia/ai-agent';

interface AIChatProperties {
    chatMessages: ChatMessage[];
    onQuery: (query: string) => void;
}

export const AIChat: React.FunctionComponent<AIChatProperties> = (properties: AIChatProperties) => {
    const { chatMessages, onQuery } = properties;
    const [query, setQuery] = React.useState('');
    return <React.Fragment>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>{chatMessages.map(message =>
            <div>
                <div><label className={getActorIcon(message.actor)}>{getActorName(message.actor)}</label></div>
                <div>{message.query}</div>
                <hr />
            </div>
        )}
        </div>
        <div>
            <input
                style={{ width: '100%' }}
                type='text'
                placeholder='Enter your Query'
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') {
                        onQuery(e.currentTarget.value);
                        setQuery('');
                    }
                }}
                value={query}
            >
            </input>
        </div>
    </React.Fragment >;
};

const getActorIcon = (actor: ChatActor): string | undefined => {
    switch (actor) {
        case 'user': { return codicon('account'); }
        case 'ai': { return codicon('copilot'); }
    }
    return undefined;
};
const getActorName = (actor: ChatActor): string => {
    switch (actor) {
        case 'user': { return 'This is me Mario'; }
        case 'ai': { return 'Theia AI'; }
    }
    return '';
};
