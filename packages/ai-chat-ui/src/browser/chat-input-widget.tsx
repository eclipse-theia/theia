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
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ChatAgent, ChatAgentService } from '@theia/ai-chat';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { UntitledResourceResolver } from '@theia/core';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { ChatModel } from '@theia/ai-chat';
import { CHAT_VIEW_LANGUAGE_EXTENSION } from './chat-view-language-contribution';

type Query = (query: string) => Promise<void>;

@injectable()
export class ChatInputWidget extends ReactWidget {
    public static ID = 'chat-input-widget';

    @inject(ChatAgentService)
    protected readonly agentService: ChatAgentService;

    @inject(MonacoEditorProvider)
    protected readonly editorProvider: MonacoEditorProvider;

    @inject(UntitledResourceResolver)
    protected readonly untitledResourceResolver: UntitledResourceResolver;

    private _onQuery: Query;
    set onQuery(query: Query) {
        this._onQuery = query;
    }
    private _chatModel: ChatModel;
    set chatModel(chatModel: ChatModel) {
        this._chatModel = chatModel;
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

    protected getChatAgents(): ChatAgent[] {
        return this.agentService.getAgents();
    }

    protected render(): React.ReactNode {
        return (
            <ChatInput
                onQuery={this._onQuery.bind(this)}
                chatModel={this._chatModel}
                getChatAgents={this.getChatAgents.bind(this)}
                editorProvider={this.editorProvider}
                untitledResourceResolver={this.untitledResourceResolver}
            />
        );
    }

}

interface ChatInputProperties {
    onQuery: (query: string) => void;
    chatModel: ChatModel;
    getChatAgents: () => ChatAgent[];
    editorProvider: MonacoEditorProvider;
    untitledResourceResolver: UntitledResourceResolver;
}
const ChatInput: React.FunctionComponent<ChatInputProperties> = (props: ChatInputProperties) => {

    const [inProgress, setInProgress] = React.useState(false);
    // eslint-disable-next-line no-null/no-null
    const ref = React.useRef<HTMLDivElement | null>(null);
    const editorRef = React.useRef<MonacoEditor | undefined>(undefined);
    const allRequests = props.chatModel.getRequests();
    const lastRequest = allRequests.length === 0 ? undefined : allRequests[allRequests.length - 1];
    const lastResponse = lastRequest?.response;

    const createInputElement = async () => {
        const resource = await props.untitledResourceResolver.createUntitledResource('', CHAT_VIEW_LANGUAGE_EXTENSION);
        const editor = await props.editorProvider.createInline(resource.uri, ref.current!, {
            language: CHAT_VIEW_LANGUAGE_EXTENSION,
            // Disable code lens, inlay hints and hover support to avoid console errors from other contributions
            codeLens: false,
            inlayHints: { enabled: 'off' },
            hover: { enabled: false },
            autoSizing: true,
            scrollBeyondLastLine: false,
            scrollBeyondLastColumn: 0,
            minHeight: 1,
            renderFinalNewline: 'on',
            fontFamily: 'var(--theia-ui-font-family)',
            fontSize: 13,
            maxHeight: -1,
            scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
            automaticLayout: true,
            lineNumbers: 'off',
            lineHeight: 15,
            padding: { top: 10, bottom: 5 },
        });
        editorRef.current = editor;
    };

    React.useEffect(() => {
        createInputElement();
        return () => {
            if (editorRef.current) {
                editorRef.current.dispose();
            }
        };
    }, []);

    React.useEffect(() => {
        const listener = lastRequest?.response.onDidChange(() => {
            if (lastRequest.response.isCanceled || lastRequest.response.isComplete) {
                setInProgress(false);
            }
        });
        return () => listener?.dispose();
    }, [lastRequest]);

    function submit(value: string): void {
        setInProgress(true);
        props.onQuery(value);
        if (editorRef.current) {
            editorRef.current.document.textEditorModel.setValue('');
        }
    };

    const onKeyDown = React.useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit(editorRef.current?.document.textEditorModel.getValue() || '');
        }
    }, []);

    return <div className='theia-ChatInput'>
        <div className='theia-ChatInput-Editor' ref={ref} onKeyDown={onKeyDown}></div>
        <div className="theia-ChatInputOptions">
            {
                inProgress ? <span
                    className="codicon codicon-stop-circle option"
                    title="Cancel (Esc)"
                    onClick={() => {
                        lastResponse?.cancel();
                        setInProgress(false);
                    }} /> :
                    <span
                        className="codicon codicon-send option"
                        title="Send (Enter)"
                        onClick={() => submit(editorRef.current?.document.textEditorModel.getValue() || '')}
                    />
            }
        </div>
    </div>;
};
