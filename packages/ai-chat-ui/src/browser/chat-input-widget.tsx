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
import { ChatAgent, ChatAgentService, ChatModel, ChatRequestModel } from '@theia/ai-chat';
import { UntitledResourceResolver } from '@theia/core';
import { ContextMenuRenderer, Message, ReactWidget } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as React from '@theia/core/shared/react';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { CHAT_VIEW_LANGUAGE_EXTENSION } from './chat-view-language-contribution';
import { IMouseEvent } from '@theia/monaco-editor-core';

type Query = (query: string) => Promise<void>;
type Cancel = (requestModel: ChatRequestModel) => void;

@injectable()
export class AIChatInputWidget extends ReactWidget {
    public static ID = 'chat-input-widget';
    static readonly CONTEXT_MENU = ['chat-input-context-menu'];

    @inject(ChatAgentService)
    protected readonly agentService: ChatAgentService;

    @inject(MonacoEditorProvider)
    protected readonly editorProvider: MonacoEditorProvider;

    @inject(UntitledResourceResolver)
    protected readonly untitledResourceResolver: UntitledResourceResolver;

    @inject(ContextMenuRenderer)
    protected readonly contextMenuRenderer: ContextMenuRenderer;

    protected isEnabled = false;

    private _onQuery: Query;
    set onQuery(query: Query) {
        this._onQuery = query;
    }
    private _onCancel: Cancel;
    set onCancel(cancel: Cancel) {
        this._onCancel = cancel;
    }
    private _chatModel: ChatModel;
    set chatModel(chatModel: ChatModel) {
        this._chatModel = chatModel;
        this.update();
    }

    @postConstruct()
    protected init(): void {
        this.id = AIChatInputWidget.ID;
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
                onCancel={this._onCancel.bind(this)}
                chatModel={this._chatModel}
                getChatAgents={this.getChatAgents.bind(this)}
                editorProvider={this.editorProvider}
                untitledResourceResolver={this.untitledResourceResolver}
                contextMenuCallback={this.handleContextMenu.bind(this)}
                isEnabled={this.isEnabled}
            />
        );
    }

    public setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        this.update();
    }

    protected handleContextMenu(event: IMouseEvent): void {
        this.contextMenuRenderer.render({
            menuPath: AIChatInputWidget.CONTEXT_MENU,
            anchor: { x: event.posx, y: event.posy },
        });
        event.preventDefault();
    }

}

interface ChatInputProperties {
    onCancel: (requestModel: ChatRequestModel) => void;
    onQuery: (query: string) => void;
    isEnabled?: boolean;
    chatModel: ChatModel;
    getChatAgents: () => ChatAgent[];
    editorProvider: MonacoEditorProvider;
    untitledResourceResolver: UntitledResourceResolver;
    contextMenuCallback: (event: IMouseEvent) => void;
}
const ChatInput: React.FunctionComponent<ChatInputProperties> = (props: ChatInputProperties) => {

    const [inProgress, setInProgress] = React.useState(false);
    // eslint-disable-next-line no-null/no-null
    const editorContainerRef = React.useRef<HTMLDivElement | null>(null);
    // eslint-disable-next-line no-null/no-null
    const placeholderRef = React.useRef<HTMLDivElement | null>(null);
    const editorRef = React.useRef<MonacoEditor | undefined>(undefined);
    const allRequests = props.chatModel.getRequests();
    const lastRequest = allRequests.length === 0 ? undefined : allRequests[allRequests.length - 1];

    const createInputElement = async () => {
        const resource = await props.untitledResourceResolver.createUntitledResource('', CHAT_VIEW_LANGUAGE_EXTENSION);
        const editor = await props.editorProvider.createInline(resource.uri, editorContainerRef.current!, {
            language: CHAT_VIEW_LANGUAGE_EXTENSION,
            // Disable code lens, inlay hints and hover support to avoid console errors from other contributions
            codeLens: false,
            inlayHints: { enabled: 'off' },
            hover: { enabled: false },
            autoSizing: true,
            scrollBeyondLastLine: false,
            scrollBeyondLastColumn: 0,
            minHeight: 1,
            fontFamily: 'var(--theia-ui-font-family)',
            fontSize: 13,
            cursorWidth: 1,
            maxHeight: -1,
            scrollbar: { horizontal: 'hidden' },
            automaticLayout: true,
            lineNumbers: 'off',
            lineHeight: 20,
            padding: { top: 8 },
            suggest: {
                showIcons: true,
                showSnippets: false,
                showWords: false,
                showStatusBar: false,
                insertMode: 'replace',
            },
            bracketPairColorization: { enabled: false },
            wrappingStrategy: 'advanced',
            stickyScroll: { enabled: false },
        });

        editor.getControl().onDidChangeModelContent(() => {
            layout();
        });

        editor.getControl().onContextMenu(e =>
            props.contextMenuCallback(e.event)
        );

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
            if (lastRequest.response.isCanceled || lastRequest.response.isComplete || lastRequest.response.isError) {
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

    function layout(): void {
        if (editorRef.current === undefined) {
            return;
        }
        const hiddenClass = 'hidden';
        const editor = editorRef.current;
        if (editor.document.textEditorModel.getValue().length > 0) {
            placeholderRef.current?.classList.add(hiddenClass);
        } else {
            placeholderRef.current?.classList.remove(hiddenClass);
        }
    }

    const onKeyDown = React.useCallback((event: React.KeyboardEvent) => {
        if (!props.isEnabled) {
            return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit(editorRef.current?.document.textEditorModel.getValue() || '');
        }
    }, [props.isEnabled]);

    return <div className='theia-ChatInput'>
        <div className='theia-ChatInput-Editor-Box'>
            <div className='theia-ChatInput-Editor' ref={editorContainerRef} onKeyDown={onKeyDown}>
                <div ref={placeholderRef} className='theia-ChatInput-Editor-Placeholder'>Enter your question</div>
            </div>
        </div>
        <div className="theia-ChatInputOptions">
            {
                inProgress ? <span
                    className="codicon codicon-stop-circle option"
                    title="Cancel (Esc)"
                    onClick={() => {
                        if (lastRequest) {
                            props.onCancel(lastRequest);
                        }
                        setInProgress(false);
                    }} /> :
                    <span
                        className="codicon codicon-send option"
                        title="Send (Enter)"
                        onClick={!props.isEnabled ? undefined : () => submit(editorRef.current?.document.textEditorModel.getValue() || '')}
                        style={{ cursor: !props.isEnabled ? 'default' : 'pointer', opacity: !props.isEnabled ? 0.5 : 1 }}
                    />
            }
        </div>
    </div>;
};
