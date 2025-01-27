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
import { ChangeSet, ChangeSetElement, ChatChangeEvent, ChatModel, ChatRequestModel } from '@theia/ai-chat';
import { Disposable, UntitledResourceResolver } from '@theia/core';
import { ContextMenuRenderer, LabelProvider, Message, ReactWidget } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { IMouseEvent } from '@theia/monaco-editor-core';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { CHAT_VIEW_LANGUAGE_EXTENSION } from './chat-view-language-contribution';

type Query = (query: string) => Promise<void>;
type Cancel = (requestModel: ChatRequestModel) => void;
type DeleteChangeSet = (requestModel: ChatRequestModel) => void;
type DeleteChangeSetElement = (requestModel: ChatRequestModel, index: number) => void;

export const AIChatInputConfiguration = Symbol('AIChatInputConfiguration');
export interface AIChatInputConfiguration {
    showContext?: boolean;
}

@injectable()
export class AIChatInputWidget extends ReactWidget {
    public static ID = 'chat-input-widget';
    static readonly CONTEXT_MENU = ['chat-input-context-menu'];

    @inject(MonacoEditorProvider)
    protected readonly editorProvider: MonacoEditorProvider;

    @inject(UntitledResourceResolver)
    protected readonly untitledResourceResolver: UntitledResourceResolver;

    @inject(ContextMenuRenderer)
    protected readonly contextMenuRenderer: ContextMenuRenderer;

    @inject(AIChatInputConfiguration) @optional()
    protected readonly configuration: AIChatInputConfiguration | undefined;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    protected editorRef: MonacoEditor | undefined = undefined;
    private editorReady = new Deferred<void>();

    protected isEnabled = false;

    private _onQuery: Query;
    set onQuery(query: Query) {
        this._onQuery = query;
    }
    private _onCancel: Cancel;
    set onCancel(cancel: Cancel) {
        this._onCancel = cancel;
    }
    private _onDeleteChangeSet: DeleteChangeSet;
    set onDeleteChangeSet(deleteChangeSet: DeleteChangeSet) {
        this._onDeleteChangeSet = deleteChangeSet;
    }
    private _onDeleteChangeSetElement: DeleteChangeSetElement;
    set onDeleteChangeSetElement(deleteChangeSetElement: DeleteChangeSetElement) {
        this._onDeleteChangeSetElement = deleteChangeSetElement;
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
        this.editorReady.promise.then(() => {
            if (this.editorRef) {
                this.editorRef.focus();
            }
        });
    }

    protected render(): React.ReactNode {
        return (
            <ChatInput
                onQuery={this._onQuery.bind(this)}
                onCancel={this._onCancel.bind(this)}
                onDeleteChangeSet={this._onDeleteChangeSet.bind(this)}
                onDeleteChangeSetElement={this._onDeleteChangeSetElement.bind(this)}
                chatModel={this._chatModel}
                editorProvider={this.editorProvider}
                untitledResourceResolver={this.untitledResourceResolver}
                contextMenuCallback={this.handleContextMenu.bind(this)}
                isEnabled={this.isEnabled}
                setEditorRef={editor => {
                    this.editorRef = editor;
                    this.editorReady.resolve();
                }}
                showContext={this.configuration?.showContext}
                labelProvider={this.labelProvider}
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
    onDeleteChangeSet: (sessionId: string) => void;
    onDeleteChangeSetElement: (sessionId: string, index: number) => void;
    isEnabled?: boolean;
    chatModel: ChatModel;
    editorProvider: MonacoEditorProvider;
    untitledResourceResolver: UntitledResourceResolver;
    contextMenuCallback: (event: IMouseEvent) => void;
    setEditorRef: (editor: MonacoEditor | undefined) => void;
    showContext?: boolean;
    labelProvider: LabelProvider;
}

const ChatInput: React.FunctionComponent<ChatInputProperties> = (props: ChatInputProperties) => {
    const onDeleteChangeSet = () => props.onDeleteChangeSet(props.chatModel.id);
    const onDeleteChangeSetElement = (index: number) => props.onDeleteChangeSetElement(props.chatModel.id, index);

    const [inProgress, setInProgress] = React.useState(false);
    const [isInputEmpty, setIsInputEmpty] = React.useState(true);
    const [changeSetUI, setChangeSetUI] = React.useState(
        () => props.chatModel.changeSet ? buildChangeSetUI(props.chatModel.changeSet, props.labelProvider, onDeleteChangeSet, onDeleteChangeSetElement) : undefined
    );

    // eslint-disable-next-line no-null/no-null
    const editorContainerRef = React.useRef<HTMLDivElement | null>(null);
    // eslint-disable-next-line no-null/no-null
    const placeholderRef = React.useRef<HTMLDivElement | null>(null);
    const editorRef = React.useRef<MonacoEditor | undefined>(undefined);

    React.useEffect(() => {
        const createInputElement = async () => {
            const paddingTop = 6;
            const lineHeight = 20;
            const maxHeight = 240;
            const resource = await props.untitledResourceResolver.createUntitledResource('', CHAT_VIEW_LANGUAGE_EXTENSION);
            const editor = await props.editorProvider.createInline(resource.uri, editorContainerRef.current!, {
                language: CHAT_VIEW_LANGUAGE_EXTENSION,
                // Disable code lens, inlay hints and hover support to avoid console errors from other contributions
                codeLens: false,
                inlayHints: { enabled: 'off' },
                hover: { enabled: false },
                autoSizing: false, // we handle the sizing ourselves
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
                lineHeight,
                padding: { top: paddingTop },
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

            if (editorContainerRef.current) {
                editorContainerRef.current.style.height = (lineHeight + (2 * paddingTop)) + 'px';
            }

            const updateEditorHeight = () => {
                if (editorContainerRef.current) {
                    const contentHeight = editor.getControl().getContentHeight() + paddingTop;
                    editorContainerRef.current.style.height = `${Math.min(contentHeight, maxHeight)}px`;
                }
            };
            editor.getControl().onDidChangeModelContent(() => {
                const value = editor.getControl().getValue();
                setIsInputEmpty(!value || value.length === 0);
                updateEditorHeight();
                handleOnChange();
            });
            const resizeObserver = new ResizeObserver(updateEditorHeight);
            if (editorContainerRef.current) {
                resizeObserver.observe(editorContainerRef.current);
            }
            editor.getControl().onDidDispose(() => {
                resizeObserver.disconnect();
            });

            editor.getControl().onContextMenu(e =>
                props.contextMenuCallback(e.event)
            );

            editorRef.current = editor;
            props.setEditorRef(editor);
        };
        createInputElement();
        return () => {
            props.setEditorRef(undefined);
            if (editorRef.current) {
                editorRef.current.dispose();
            }
        };
    }, []);

    const responseListenerRef = React.useRef<Disposable>();
    // track chat model updates to keep our UI in sync
    // - keep "inProgress" in sync with the request state
    // - keep "changeSetUI" in sync with the change set
    React.useEffect(() => {
        const listener = props.chatModel.onDidChange(event => {
            if (event.kind === 'addRequest') {
                if (event.request) {
                    setInProgress(ChatRequestModel.isInProgress(event.request));
                }
                responseListenerRef.current?.dispose();
                responseListenerRef.current = event.request.response.onDidChange(() =>
                    setInProgress(ChatRequestModel.isInProgress(event.request))
                );
            } else if (ChatChangeEvent.isChangeSetEvent(event)) {
                if (event.changeSet) {
                    setChangeSetUI(buildChangeSetUI(event.changeSet, props.labelProvider, onDeleteChangeSet, onDeleteChangeSetElement));
                } else {
                    setChangeSetUI(undefined);
                }
            }
        });
        setChangeSetUI(props.chatModel.changeSet ? buildChangeSetUI(props.chatModel.changeSet, props.labelProvider, onDeleteChangeSet, onDeleteChangeSetElement) : undefined);
        return () => {
            listener?.dispose();
            responseListenerRef.current?.dispose();
            responseListenerRef.current = undefined;
        };
    }, [props.chatModel]);

    function submit(value: string): void {
        if (!value || value.trim().length === 0) {
            return;
        }
        setInProgress(true);
        props.onQuery(value);
        if (editorRef.current) {
            editorRef.current.document.textEditorModel.setValue('');
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

    const handleInputFocus = () => {
        hidePlaceholderIfEditorFilled();
    };

    const handleOnChange = () => {
        showPlaceholderIfEditorEmpty();
        hidePlaceholderIfEditorFilled();
    };

    const handleInputBlur = () => {
        showPlaceholderIfEditorEmpty();
    };

    const showPlaceholderIfEditorEmpty = () => {
        if (!editorRef.current?.getControl().getValue()) {
            placeholderRef.current?.classList.remove('hidden');
        }
    };

    const hidePlaceholderIfEditorFilled = () => {
        const value = editorRef.current?.getControl().getValue();
        if (value && value.length > 0) {
            placeholderRef.current?.classList.add('hidden');
        }
    };

    const leftOptions = props.showContext ? [{
        title: 'Attach elements to context',
        handler: () => { /* TODO */ },
        className: 'codicon-add'
    }] : [];

    const rightOptions = inProgress
        ? [{
            title: 'Cancel (Esc)',
            handler: () => {
                const latestRequest = getLatestRequest(props.chatModel);
                if (latestRequest) {
                    props.onCancel(latestRequest);
                }
                setInProgress(false);
            },
            className: 'codicon-stop-circle'
        }]
        : [{
            title: 'Send (Enter)',
            handler: () => {
                if (props.isEnabled) {
                    submit(editorRef.current?.document.textEditorModel.getValue() || '');
                }
            },
            className: 'codicon-send',
            disabled: isInputEmpty || !props.isEnabled
        }];

    return <div className='theia-ChatInput'>
        {changeSetUI?.elements &&
            <ChangeSetBox changeSet={changeSetUI} />
        }
        <div className='theia-ChatInput-Editor-Box'>
            <div className='theia-ChatInput-Editor' ref={editorContainerRef} onKeyDown={onKeyDown} onFocus={handleInputFocus} onBlur={handleInputBlur}>
                <div ref={placeholderRef} className='theia-ChatInput-Editor-Placeholder'>Ask a question</div>
            </div>
            <ChatInputOptions leftOptions={leftOptions} rightOptions={rightOptions} />
        </div>
    </div>;
};

const noPropagation = (handler: () => void) => (e: React.MouseEvent) => {
    handler();
    e.stopPropagation();
};

const buildChangeSetUI = (changeSet: ChangeSet, labelProvider: LabelProvider, onDeleteChangeSet: () => void, onDeleteChangeSetElement: (index: number) => void): ChangeSetUI => ({
    title: changeSet.title,
    disabled: !hasPendingElementsToAccept(changeSet),
    acceptAllPendingElements: () => acceptAllPendingElements(changeSet),
    delete: () => onDeleteChangeSet(),
    elements: changeSet.getElements().map(element => ({
        open: element?.open?.bind(element),
        iconClass: element.icon ?? labelProvider.getIcon(element.uri) ?? labelProvider.fileIcon,
        nameClass: `${element.type} ${element.state}`,
        name: element.name ?? labelProvider.getName(element.uri),
        additionalInfo: element.additionalInfo ?? labelProvider.getDetails(element.uri),
        openChange: element?.openChange?.bind(element),
        accept: element.state !== 'applied' ? element?.accept?.bind(element) : undefined,
        discard: element.state === 'applied' ? element?.discard?.bind(element) : undefined,
        delete: () => onDeleteChangeSetElement(changeSet.getElements().indexOf(element))
    }))
});

interface ChangeSetUIElement {
    name: string;
    iconClass: string;
    nameClass: string;
    additionalInfo: string;
    open?: () => void;
    openChange?: () => void;
    accept?: () => void;
    discard?: () => void;
    delete: () => void;
}

interface ChangeSetUI {
    title: string;
    disabled: boolean;
    acceptAllPendingElements: () => void;
    delete: () => void;
    elements: ChangeSetUIElement[];
}

const ChangeSetBox: React.FunctionComponent<{ changeSet: ChangeSetUI }> = ({ changeSet }) => (
    <div className='theia-ChatInput-ChangeSet-Box'>
        <div className='theia-ChatInput-ChangeSet-Header'>
            <h3>{changeSet.title}</h3>
            <div className='theia-ChatInput-ChangeSet-Header-Actions'>
                <button
                    className='theia-button'
                    disabled={changeSet.disabled}
                    title='Accept all pending changes'
                    onClick={() => changeSet.acceptAllPendingElements()}
                >
                    Accept
                </button>
                <span className='codicon codicon-close action' title='Delete Change Set' onClick={() => changeSet.delete()} />
            </div>
        </div>
        <div className='theia-ChatInput-ChangeSet-List'>
            <ul>
                {changeSet.elements.map((element, index) => (
                    <li key={index} onClick={() => element.open?.()}>
                        <div className={`theia-ChatInput-ChangeSet-Icon ${element.iconClass}`} />
                        <span className={`theia-ChatInput-ChangeSet-title ${element.nameClass}`}>
                            {element.name}
                        </span>
                        <span className='theia-ChatInput-ChangeSet-additionalInfo'>
                            {element.additionalInfo}
                        </span>
                        <div className='theia-ChatInput-ChangeSet-Actions'>
                            {element.openChange && (<span className='codicon codicon-diff-single action' title='Open Diff' onClick={noPropagation(() => element.openChange!())} />)}
                            {element.discard && (<span className='codicon codicon-discard action' title='Undo' onClick={noPropagation(() => element.discard!())} />)}
                            {element.accept && (<span className='codicon codicon-check action' title='Accept' onClick={noPropagation(() => element.accept!())} />)}
                            <span className='codicon codicon-close action' title='Delete' onClick={noPropagation(() => element.delete())} />
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    </div>
);

interface ChatInputOptionsProps {
    leftOptions: Option[];
    rightOptions: Option[];
}

interface Option {
    title: string;
    handler: () => void;
    className: string;
    disabled?: boolean;
}

const ChatInputOptions: React.FunctionComponent<ChatInputOptionsProps> = ({ leftOptions, rightOptions }) => (
    <div className="theia-ChatInputOptions">
        <div className="theia-ChatInputOptions-left">
            {leftOptions.map((option, index) => (
                <span
                    key={index}
                    className={`codicon ${option.className} option ${option.disabled ? 'disabled' : ''}`}
                    title={option.title}
                    onClick={option.handler}
                />
            ))}
        </div>
        <div className="theia-ChatInputOptions-right">
            {rightOptions.map((option, index) => (
                <span
                    key={index}
                    className={`codicon ${option.className} option ${option.disabled ? 'disabled' : ''}`}
                    title={option.title}
                    onClick={option.handler}
                />
            ))}
        </div>
    </div>
);

function acceptAllPendingElements(changeSet: ChangeSet): void {
    acceptablePendingElements(changeSet).forEach(e => e.accept!());
}

function hasPendingElementsToAccept(changeSet: ChangeSet): boolean | undefined {
    return acceptablePendingElements(changeSet).length > 0;
}

function acceptablePendingElements(changeSet: ChangeSet): ChangeSetElement[] {
    return changeSet.getElements().filter(e => e.accept && (e.state === undefined || e.state === 'pending'));
}

function getLatestRequest(chatModel: ChatModel): ChatRequestModel | undefined {
    const requests = chatModel.getRequests();
    return requests.length > 0 ? requests[requests.length - 1] : undefined;
}
