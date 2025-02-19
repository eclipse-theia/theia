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
import { ChangeSet, ChangeSetElement, ChatAgent, ChatChangeEvent, ChatModel, ChatRequestModel } from '@theia/ai-chat';
import { Disposable, nls, UntitledResourceResolver } from '@theia/core';
import { ContextMenuRenderer, LabelProvider, Message, ReactWidget } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { IMouseEvent } from '@theia/monaco-editor-core';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { CHAT_VIEW_LANGUAGE_EXTENSION } from './chat-view-language-contribution';
import { AIVariableResolutionRequest, AIVariableService } from '@theia/ai-core';
import { ContextVariablePicker } from './context-variable-picker';

type Query = (query: string, context?: AIVariableResolutionRequest[]) => Promise<void>;
type Unpin = () => void;
type Cancel = (requestModel: ChatRequestModel) => void;
type DeleteChangeSet = (requestModel: ChatRequestModel) => void;
type DeleteChangeSetElement = (requestModel: ChatRequestModel, index: number) => void;

export const AIChatInputConfiguration = Symbol('AIChatInputConfiguration');
export interface AIChatInputConfiguration {
    showContext?: boolean;
    showPinnedAgent?: boolean;
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

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(ContextVariablePicker)
    protected readonly contextVariablePicker: ContextVariablePicker;

    protected editorRef: MonacoEditor | undefined = undefined;
    private editorReady = new Deferred<void>();

    protected isEnabled = false;

    protected context: AIVariableResolutionRequest[] = [];

    private _onQuery: Query;
    set onQuery(query: Query) {
        this._onQuery = query;
    }
    private _onUnpin: Unpin;
    set onUnpin(unpin: Unpin) {
        this._onUnpin = unpin;
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
    private _pinnedAgent: ChatAgent | undefined;
    set pinnedAgent(pinnedAgent: ChatAgent | undefined) {
        this._pinnedAgent = pinnedAgent;
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
                onUnpin={this._onUnpin.bind(this)}
                onCancel={this._onCancel.bind(this)}
                onDragOver={this.onDragOver.bind(this)}
                onDrop={this.onDrop.bind(this)}
                onDeleteChangeSet={this._onDeleteChangeSet.bind(this)}
                onDeleteChangeSetElement={this._onDeleteChangeSetElement.bind(this)}
                onAddContextElement={this.addContextElement.bind(this)}
                onDeleteContextElement={this.deleteContextElement.bind(this)}
                context={this.context}
                chatModel={this._chatModel}
                pinnedAgent={this._pinnedAgent}
                editorProvider={this.editorProvider}
                untitledResourceResolver={this.untitledResourceResolver}
                contextMenuCallback={this.handleContextMenu.bind(this)}
                isEnabled={this.isEnabled}
                setEditorRef={editor => {
                    this.editorRef = editor;
                    this.editorReady.resolve();
                }}
                showContext={this.configuration?.showContext}
                showPinnedAgent={this.configuration?.showPinnedAgent}
                labelProvider={this.labelProvider}
            />
        );
    }

    protected onDragOver(event: React.DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.node.classList.add('drag-over');
        if (event.dataTransfer?.types.includes('text/plain')) {
            event.dataTransfer!.dropEffect = 'copy';
        } else {
            event.dataTransfer!.dropEffect = 'link';
        }
    }

    protected onDrop(event: React.DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.node.classList.remove('drag-over');
        const dataTransferText = event.dataTransfer?.getData('text/plain');
        const position = this.editorRef?.getControl().getTargetAtClientPoint(event.clientX, event.clientY)?.position;
        this.variableService.getDropResult(event.nativeEvent, { type: 'ai-chat-input-widget' }).then(result => {
            result.variables.forEach(variable => this.addContext(variable));
            const text = result.text ?? dataTransferText;
            if (position && text) {
                this.editorRef?.getControl().executeEdits('drag-and-drop', [{
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: position.column,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column
                    },
                    text
                }]);
            }
        });
    }

    public setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        this.update();
    }

    protected addContextElement(): void {
        this.contextVariablePicker.pickContextVariable().then(contextElement => {
            if (contextElement) {
                this.context.push(contextElement);
                this.update();
            }
        });
    }

    protected deleteContextElement(index: number): void {
        this.context.splice(index, 1);
        this.update();
    }

    protected handleContextMenu(event: IMouseEvent): void {
        this.contextMenuRenderer.render({
            menuPath: AIChatInputWidget.CONTEXT_MENU,
            anchor: { x: event.posx, y: event.posy },
        });
        event.preventDefault();
    }

    addContext(variable: AIVariableResolutionRequest): void {
        this.context.push(variable);
        this.update();
    }
}

interface ChatInputProperties {
    onCancel: (requestModel: ChatRequestModel) => void;
    onQuery: (query: string, context?: AIVariableResolutionRequest[]) => void;
    onUnpin: () => void;
    onDragOver: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
    onDeleteChangeSet: (sessionId: string) => void;
    onDeleteChangeSetElement: (sessionId: string, index: number) => void;
    onAddContextElement: () => void;
    onDeleteContextElement: (index: number) => void;
    context?: AIVariableResolutionRequest[];
    isEnabled?: boolean;
    chatModel: ChatModel;
    pinnedAgent?: ChatAgent;
    editorProvider: MonacoEditorProvider;
    untitledResourceResolver: UntitledResourceResolver;
    contextMenuCallback: (event: IMouseEvent) => void;
    setEditorRef: (editor: MonacoEditor | undefined) => void;
    showContext?: boolean;
    showPinnedAgent?: boolean;
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
        props.onQuery(value, props.context);
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

    const handlePin = () => {
        if (editorRef.current) {
            editorRef.current.getControl().getModel()?.applyEdits([{
                range: {
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: 1,
                    endColumn: 1
                },
                text: '@ ',
            }]);
            editorRef.current.getControl().setPosition({ lineNumber: 1, column: 2 });
            editorRef.current.getControl().getAction('editor.action.triggerSuggest')?.run();
        }
    };

    const leftOptions = [
        ...(props.showContext
            ? [{
                title: nls.localize('theia/ai/chat-ui/attachToContext', 'Attach elements to context'),
                handler: () => props.onAddContextElement(),
                className: 'codicon-add'
            }]
            : []),
        ...(props.showPinnedAgent
            ? [{
                title: props.pinnedAgent ? nls.localize('theia/ai/chat-ui/unpinAgent', 'Unpin Agent') : nls.localize('theia/ai/chat-ui/pinAgent', 'Pin Agent'),
                handler: props.pinnedAgent ? props.onUnpin : handlePin,
                className: 'at-icon',
                text: {
                    align: 'right',
                    content: props.pinnedAgent && props.pinnedAgent.name
                },
            }]
            : []),
    ] as Option[];

    const rightOptions = inProgress
        ? [{
            title: nls.localize('theia/ai/chat-ui/cancel', 'Cancel (Esc)'),
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
            title: nls.localize('theia/ai/chat-ui/send', 'Send (Enter)'),
            handler: () => {
                if (props.isEnabled) {
                    submit(editorRef.current?.document.textEditorModel.getValue() || '');
                }
            },
            className: 'codicon-send',
            disabled: isInputEmpty || !props.isEnabled
        }];

    const contextUI = buildContextUI(props.context, props.labelProvider, props.onDeleteContextElement);

    return <div className='theia-ChatInput' onDragOver={props.onDragOver} onDrop={props.onDrop}    >
        {changeSetUI?.elements &&
            <ChangeSetBox changeSet={changeSetUI} />
        }
        <div className='theia-ChatInput-Editor-Box'>
            <div className='theia-ChatInput-Editor' ref={editorContainerRef} onKeyDown={onKeyDown} onFocus={handleInputFocus} onBlur={handleInputBlur}>
                <div ref={placeholderRef} className='theia-ChatInput-Editor-Placeholder'>{nls.localizeByDefault('Ask a question')}</div>
            </div>
            {props.context && props.context.length > 0 &&
                <ChatContext context={contextUI.context} />
            }
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
    applyAllPendingElements: () => applyAllPendingElements(changeSet),
    delete: () => onDeleteChangeSet(),
    elements: changeSet.getElements().map(element => ({
        open: element?.open?.bind(element),
        iconClass: element.icon ?? labelProvider.getIcon(element.uri) ?? labelProvider.fileIcon,
        nameClass: `${element.type} ${element.state}`,
        name: element.name ?? labelProvider.getName(element.uri),
        additionalInfo: element.additionalInfo ?? labelProvider.getDetails(element.uri),
        openChange: element?.openChange?.bind(element),
        apply: element.state !== 'applied' ? element?.apply?.bind(element) : undefined,
        revert: element.state === 'applied' || element.state === 'stale' ? element?.revert?.bind(element) : undefined,
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
    apply?: () => void;
    revert?: () => void;
    delete: () => void;
}

interface ChangeSetUI {
    title: string;
    disabled: boolean;
    applyAllPendingElements: () => void;
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
                    title={nls.localize('theia/ai/chat-ui/applyAllTitle', 'Apply all pending suggestions')}
                    onClick={() => changeSet.applyAllPendingElements()}
                >
                    {nls.localize('theia/ai/chat-ui/acceptAll', 'Apply All')}
                </button>
                <span className='codicon codicon-close action' title={nls.localize('theia/ai/chat-ui/deleteChangeSet', 'Delete Change Set')} onClick={() => changeSet.delete()} />
            </div>
        </div>
        <div className='theia-ChatInput-ChangeSet-List'>
            <ul>
                {changeSet.elements.map((element, index) => (
                    <li key={index} title={nls.localize('theia/ai/chat-ui/openDiff', 'Open Diff')} onClick={() => element.openChange?.()}>
                        <div className={`theia-ChatInput-ChangeSet-Icon ${element.iconClass}`} />
                        <span className='theia-ChatInput-ChangeSet-labelParts'>
                            <span className={`theia-ChatInput-ChangeSet-title ${element.nameClass}`}>
                                {element.name}
                            </span>
                            <span className='theia-ChatInput-ChangeSet-additionalInfo'>
                                {element.additionalInfo}
                            </span>
                        </span>
                        <div className='theia-ChatInput-ChangeSet-Actions'>
                            {element.open && (
                                <span
                                    className='codicon codicon-file action'
                                    title={nls.localize('theia/ai/chat-ui/openOriginalFile', 'Open Original File')}
                                    onClick={noPropagation(() => element.open!())}
                                />)}
                            {element.revert && (
                                <span
                                    className='codicon codicon-discard action'
                                    title={nls.localizeByDefault('Revert')}
                                    onClick={noPropagation(() => element.revert!())}
                                />)}
                            {element.apply && (
                                <span
                                    className='codicon codicon-check action'
                                    title={nls.localizeByDefault('Apply')}
                                    onClick={noPropagation(() => element.apply!())}
                                />)}
                            <span className='codicon codicon-close action' title={nls.localizeByDefault('Delete')} onClick={noPropagation(() => element.delete())} />
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
    text?: {
        align?: 'left' | 'right';
        content: string;
    };
}

const ChatInputOptions: React.FunctionComponent<ChatInputOptionsProps> = ({ leftOptions, rightOptions }) => (
    <div className="theia-ChatInputOptions">
        <div className="theia-ChatInputOptions-left">
            {leftOptions.map((option, index) => (
                <span
                    key={index}
                    className={`option ${option.disabled ? 'disabled' : ''} ${option.text?.align === 'right' ? 'reverse' : ''}`}
                    title={option.title}
                    onClick={option.handler}
                >
                    <span>{option.text?.content}</span>
                    <span className={`codicon ${option.className}`} />
                </span>
            ))}
        </div>
        <div className="theia-ChatInputOptions-right">
            {rightOptions.map((option, index) => (
                <span
                    key={index}
                    className={`option ${option.disabled ? 'disabled' : ''} ${option.text?.align === 'right' ? 'reverse' : ''}`}
                    title={option.title}
                    onClick={option.handler}
                >
                    <span>{option.text?.content}</span>
                    <span className={`codicon ${option.className}`} />
                </span>
            ))}
        </div>
    </div>
);

function applyAllPendingElements(changeSet: ChangeSet): void {
    getPendingElements(changeSet).forEach(e => e.apply!());
}

function hasPendingElementsToAccept(changeSet: ChangeSet): boolean | undefined {
    return getPendingElements(changeSet).length > 0;
}

function getPendingElements(changeSet: ChangeSet): ChangeSetElement[] {
    return changeSet.getElements().filter(e => e.apply && (e.state === undefined || e.state === 'pending'));
}

function getLatestRequest(chatModel: ChatModel): ChatRequestModel | undefined {
    const requests = chatModel.getRequests();
    return requests.length > 0 ? requests[requests.length - 1] : undefined;
}

function buildContextUI(context: AIVariableResolutionRequest[] | undefined, labelProvider: LabelProvider, onDeleteContextElement: (index: number) => void): ChatContextUI {
    if (!context) {
        return { context: [] };
    }
    return {
        context: context.map((element, index) => ({
            name: labelProvider.getName(element),
            iconClass: labelProvider.getIcon(element),
            nameClass: element.variable.name,
            additionalInfo: labelProvider.getDetails(element),
            details: labelProvider.getLongName(element),
            delete: () => onDeleteContextElement(index),
        }))
    };
}

interface ChatContextUI {
    context: {
        name: string;
        iconClass: string;
        nameClass: string;
        additionalInfo?: string;
        details?: string;
        delete: () => void;
        open?: () => void;
    }[];
}

const ChatContext: React.FunctionComponent<ChatContextUI> = ({ context }) => (
    <div className="theia-ChatInput-ChatContext">
        <ul>
            {context.map((element, index) => (
                <li key={index} className="theia-ChatInput-ChatContext-Element" title={element.details} onClick={() => element.open?.()}>
                    <div className={`theia-ChatInput-ChatContext-Icon ${element.iconClass}`} />
                    <span className={`theia-ChatInput-ChatContext-title ${element.nameClass}`}>
                        {element.name}
                    </span>
                    <span className='theia-ChatInput-ChatContext-additionalInfo'>
                        {element.additionalInfo}
                    </span>
                    <span className="codicon codicon-close action" title={nls.localizeByDefault('Delete')} onClick={() => element.delete()} />
                </li>
            ))}
        </ul>
    </div>
);
