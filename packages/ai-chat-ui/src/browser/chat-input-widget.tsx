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
import { Message, ReactWidget } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { injectable, postConstruct } from '@theia/core/shared/inversify';

type Query = (query: string) => Promise<void>;

@injectable()
export class ChatInputWidget extends ReactWidget {
    public static ID = 'chat-input-widget';

    private _onQuery: Query;
    set onQuery(query: Query) {
        this._onQuery = query;
    }

    @postConstruct()
    protected init(): void {
        this.id = ChatInputWidget.ID;
        this.title.closable = false;
        this.update();
    }
    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus({ preventScroll: true });
    }
    protected render(): React.ReactNode {
        return <ChatInput onQuery={this._onQuery.bind(this)} />;
    }

}

interface ChatInputProperties {
    onQuery: (query: string) => void;
}
const ChatInput: React.FunctionComponent<ChatInputProperties> = (props: ChatInputProperties) => {

    const [query, setQuery] = React.useState('');
    // eslint-disable-next-line no-null/no-null
    const inputRef = React.useRef<HTMLTextAreaElement>(null);

    function submit(value: string): void {
        props.onQuery(value);
        setQuery('');
        if (inputRef.current) {
            inputRef.current.value = '';
            adjustHeight(inputRef.current);
        }
    }

    function adjustHeight(textarea: EventTarget & HTMLTextAreaElement): void {
        textarea.style.height = '';
        if (textarea.scrollHeight > 36) {
            textarea.style.height = textarea.scrollHeight + 'px';
        }
    }

    return <div>
        <textarea
            ref={inputRef}
            className='theia-input theia-ChatInput'
            placeholder='Ask the AI...'
            onChange={e => {
                adjustHeight(e.target);
                setQuery(e.target.value);
            }}
            onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    submit(e.currentTarget.value);
                    e.preventDefault();
                } else if (e.key === 'Enter' && e.shiftKey) {
                    adjustHeight(e.currentTarget);
                }
            }}
            value={query}
        >
        </textarea>
        <div className="theia-ChatInputOptions">
            <span
                className="codicon codicon-send option"
                title="Send (Enter)"
                onClick={() => submit(inputRef.current?.value || '')}
            />
        </div>
    </div>;
};
