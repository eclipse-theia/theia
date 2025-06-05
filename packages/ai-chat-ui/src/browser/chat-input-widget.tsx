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
import {
    ChangeSet, ChangeSetElement, ChatAgent, ChatChangeEvent, ChatModel, ChatRequestModel,
    ChatService, ChatSuggestion, EditableChatRequestModel, ChatHierarchyBranch
} from '@theia/ai-chat';
import { DisposableCollection, InMemoryResources, URI, nls } from '@theia/core';
import { ContextMenuRenderer, LabelProvider, Message, OpenerService, ReactWidget } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { IMouseEvent } from '@theia/monaco-editor-core';
import { SimpleMonacoEditor } from '@theia/monaco/lib/browser/simple-monaco-editor';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { CHAT_VIEW_LANGUAGE_EXTENSION } from './chat-view-language-contribution';
import { AIVariableResolutionRequest } from '@theia/ai-core';
import { FrontendVariableService } from '@theia/ai-core/lib/browser';
import { ContextVariablePicker } from './context-variable-picker';
import { ChangeSetActionRenderer, ChangeSetActionService } from './change-set-actions/change-set-action-service';
import { ChangeSetDecoratorService } from '@theia/ai-chat/lib/browser/change-set-decorator-service';
import { ChatInputAgentSuggestions } from './chat-input-agent-suggestions';

type Query = (query: string) => Promise<void>;
type Unpin = () => void;
type Cancel = (requestModel: ChatRequestModel) => void;
type DeleteChangeSet = (requestModel: ChatRequestModel) => void;
type DeleteChangeSetElement = (requestModel: ChatRequestModel, index: number) => void;
type OpenContextElement = (request: AIVariableResolutionRequest) => unknown;

export const AIChatInputConfiguration = Symbol('AIChatInputConfiguration');
export interface AIChatInputConfiguration {
    showContext?: boolean;
    showPinnedAgent?: boolean;
    showChangeSet?: boolean;
    showSuggestions?: boolean;
}

@injectable()
export class AIChatInputWidget extends ReactWidget {
    public static ID = 'chat-input-widget';
    static readonly CONTEXT_MENU = ['chat-input-context-menu'];

    @inject(MonacoEditorProvider)
    protected readonly editorProvider: MonacoEditorProvider;

    @inject(InMemoryResources)
    protected readonly resources: InMemoryResources;

    @inject(ContextMenuRenderer)
    protected readonly contextMenuRenderer: ContextMenuRenderer;

    @inject(AIChatInputConfiguration) @optional()
    protected readonly configuration: AIChatInputConfiguration | undefined;

    @inject(FrontendVariableService)
    protected readonly variableService: FrontendVariableService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(ContextVariablePicker)
    protected readonly contextVariablePicker: ContextVariablePicker;

    @inject(ChangeSetActionService)
    protected readonly changeSetActionService: ChangeSetActionService;

    @inject(ChangeSetDecoratorService)
    protected readonly changeSetDecoratorService: ChangeSetDecoratorService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    protected editorRef: SimpleMonacoEditor | undefined = undefined;
    protected readonly editorReady = new Deferred<void>();

    protected isEnabled = false;

    private _branch?: ChatHierarchyBranch;
    set branch(branch: ChatHierarchyBranch | undefined) {
        if (this._branch !== branch) {
            this._branch = branch;
            this.update();
        }
    }

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

    private _initialValue?: string;
    set initialValue(value: string | undefined) {
        this._initialValue = value;
    }

    protected onDisposeForChatModel = new DisposableCollection();
    private _chatModel: ChatModel;
    set chatModel(chatModel: ChatModel) {
        this.onDisposeForChatModel.dispose();
        this.onDisposeForChatModel = new DisposableCollection();
        this.onDisposeForChatModel.push(chatModel.onDidChange(event => {
            if (event.kind === 'addVariable' || event.kind === 'removeVariable' || event.kind === 'addRequest' || event.kind === 'changeHierarchyBranch') {
                this.update();
            }
        }));
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
        this.toDispose.push(this.resources.add(this.getResourceUri(), ''));
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

    protected getResourceUri(): URI {
        return new URI(`ai-chat:/input.${CHAT_VIEW_LANGUAGE_EXTENSION}`);
    }

    protected render(): React.ReactNode {
        const branch = this._branch;
        const chatModel = this._chatModel;

        // State of the input widget's action buttons depends on the state of the currently active or last processed
        // request, if there is one. If the chat model has branched, then the current request is the last on the
        // branch. Otherwise, it's the last request in the chat model.
        const currentRequest: ChatRequestModel | undefined = branch?.items?.at(-1)?.element ?? chatModel.getRequests().at(-1);
        const isEditing = !!(currentRequest && (EditableChatRequestModel.isEditing(currentRequest)));
        const isPending = () => !!(currentRequest && !isEditing && ChatRequestModel.isInProgress(currentRequest));
        const pending = isPending();

        return (
            <ChatInput
                branch={this._branch}
                onQuery={this._onQuery.bind(this)}
                onUnpin={this._onUnpin.bind(this)}
                onCancel={this._onCancel.bind(this)}
                onDragOver={this.onDragOver.bind(this)}
                onDrop={this.onDrop.bind(this)}
                onDeleteChangeSet={this._onDeleteChangeSet.bind(this)}
                onDeleteChangeSetElement={this._onDeleteChangeSetElement.bind(this)}
                onAddContextElement={this.addContextElement.bind(this)}
                onDeleteContextElement={this.deleteContextElement.bind(this)}
                onOpenContextElement={this.openContextElement.bind(this)}
                context={this.getContext()}
                chatModel={this._chatModel}
                pinnedAgent={this._pinnedAgent}
                editorProvider={this.editorProvider}
                uri={this.getResourceUri()}
                contextMenuCallback={this.handleContextMenu.bind(this)}
                isEnabled={this.isEnabled}
                setEditorRef={editor => {
                    this.editorRef = editor;
                    this.editorReady.resolve();
                }}
                showContext={this.configuration?.showContext}
                showPinnedAgent={this.configuration?.showPinnedAgent}
                showChangeSet={this.configuration?.showChangeSet}
                showSuggestions={this.configuration?.showSuggestions}
                labelProvider={this.labelProvider}
                actionService={this.changeSetActionService}
                decoratorService={this.changeSetDecoratorService}
                initialValue={this._initialValue}
                openerService={this.openerService}
                suggestions={this._chatModel.suggestions}
                currentRequest={currentRequest}
                isEditing={isEditing}
                pending={pending}
                onResponseChanged={() => {
                    if (isPending() !== pending) {
                        this.update();
                    }
                }}
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

    protected async openContextElement(request: AIVariableResolutionRequest): Promise<void> {
        const session = this.chatService.getSessions().find(candidate => candidate.model.id === this._chatModel.id);
        const context = { session };
        await this.variableService.open(request, context);
    }

    public setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        this.update();
    }

    protected addContextElement(): void {
        this.contextVariablePicker.pickContextVariable().then(contextElement => {
            if (contextElement) {
                this.addContext(contextElement);
            }
        });
    }

    protected deleteContextElement(index: number): void {
        this._chatModel.context.deleteVariables(index);
    }

    protected handleContextMenu(event: IMouseEvent): void {
        this.contextMenuRenderer.render({
            menuPath: AIChatInputWidget.CONTEXT_MENU,
            anchor: { x: event.posx, y: event.posy },
            context: event.target,
            args: [this.editorRef]
        });
        event.preventDefault();
    }

    addContext(variable: AIVariableResolutionRequest): void {
        this._chatModel.context.addVariables(variable);
    }

    protected getContext(): readonly AIVariableResolutionRequest[] {
        return this._chatModel.context.getVariables();
    }
}

interface ChatInputProperties {
    branch?: ChatHierarchyBranch;
    onCancel: (requestModel: ChatRequestModel) => void;
    onQuery: (query: string) => void;
    onUnpin: () => void;
    onDragOver: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
    onDeleteChangeSet: (sessionId: string) => void;
    onDeleteChangeSetElement: (sessionId: string, uri: URI) => void;
    onAddContextElement: () => void;
    onDeleteContextElement: (index: number) => void;
    onOpenContextElement: OpenContextElement;
    context?: readonly AIVariableResolutionRequest[];
    isEnabled?: boolean;
    chatModel: ChatModel;
    pinnedAgent?: ChatAgent;
    editorProvider: MonacoEditorProvider;
    uri: URI;
    contextMenuCallback: (event: IMouseEvent) => void;
    setEditorRef: (editor: SimpleMonacoEditor | undefined) => void;
    showContext?: boolean;
    showPinnedAgent?: boolean;
    showChangeSet?: boolean;
    showSuggestions?: boolean;
    labelProvider: LabelProvider;
    actionService: ChangeSetActionService;
    decoratorService: ChangeSetDecoratorService;
    initialValue?: string;
    openerService: OpenerService;
    suggestions: readonly ChatSuggestion[];
    currentRequest?: ChatRequestModel;
    isEditing: boolean;
    pending: boolean;
    onResponseChanged: () => void;
}

const ChatInput: React.FunctionComponent<ChatInputProperties> = (props: ChatInputProperties) => {
    const onDeleteChangeSet = () => props.onDeleteChangeSet(props.chatModel.id);
    const onDeleteChangeSetElement = (uri: URI) => props.onDeleteChangeSetElement(props.chatModel.id, uri);

    const [isInputEmpty, setIsInputEmpty] = React.useState(true);
    const [changeSetUI, setChangeSetUI] = React.useState(
        () => buildChangeSetUI(
            props.chatModel.changeSet,
            props.labelProvider,
            props.decoratorService,
            props.actionService.getActionsForChangeset(props.chatModel.changeSet),
            onDeleteChangeSet,
            onDeleteChangeSetElement
        ));

    // eslint-disable-next-line no-null/no-null
    const editorContainerRef = React.useRef<HTMLDivElement | null>(null);
    // eslint-disable-next-line no-null/no-null
    const placeholderRef = React.useRef<HTMLDivElement | null>(null);
    const editorRef = React.useRef<SimpleMonacoEditor | undefined>(undefined);

    React.useEffect(() => {
        const uri = props.uri;
        const createInputElement = async () => {
            const paddingTop = 6;
            const lineHeight = 20;
            const maxHeight = 240;
            const editor = await props.editorProvider.createSimpleInline(uri, editorContainerRef.current!, {
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
                scrollbar: { horizontal: 'hidden', alwaysConsumeMouseWheel: false, handleMouseWheel: true },
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
                editorContainerRef.current.style.overflowY = 'auto'; // ensure vertical scrollbar
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

            if (props.initialValue) {
                setValue(props.initialValue);
            }
        };
        createInputElement();

        return () => {
            props.setEditorRef(undefined);
            if (editorRef.current) {
                editorRef.current.dispose();
            }
        };
    }, []);

    React.useEffect(() => {
        setChangeSetUI(buildChangeSetUI(
            props.chatModel.changeSet,
            props.labelProvider,
            props.decoratorService,
            props.actionService.getActionsForChangeset(props.chatModel.changeSet),
            onDeleteChangeSet,
            onDeleteChangeSetElement
        ));
        const listener = props.chatModel.onDidChange(event => {
            if (ChatChangeEvent.isChangeSetEvent(event)) {
                setChangeSetUI(buildChangeSetUI(
                    props.chatModel.changeSet,
                    props.labelProvider,
                    props.decoratorService,
                    props.actionService.getActionsForChangeset(props.chatModel.changeSet),
                    onDeleteChangeSet,
                    onDeleteChangeSetElement
                ));
            }
        });
        return () => {
            listener.dispose();
        };
    }, [props.chatModel, props.labelProvider, props.decoratorService, props.actionService]);

    React.useEffect(() => {
        const disposable = props.actionService.onDidChange(() => {
            const newActions = props.actionService.getActionsForChangeset(props.chatModel.changeSet);
            setChangeSetUI(current => !current ? current : { ...current, actions: newActions });
        });
        return () => disposable.dispose();
    });

    React.useEffect(() => {
        const disposable = props.decoratorService.onDidChangeDecorations(() => {
            setChangeSetUI(buildChangeSetUI(
                props.chatModel.changeSet,
                props.labelProvider,
                props.decoratorService,
                props.actionService.getActionsForChangeset(props.chatModel.changeSet),
                onDeleteChangeSet,
                onDeleteChangeSetElement
            ));
        });
        return () => disposable.dispose();
    });

    const setValue = React.useCallback((value: string) => {
        if (editorRef.current && !editorRef.current.document.isDisposed()) {
            editorRef.current.document.textEditorModel.setValue(value);
        }
    }, [editorRef]);

    const submit = React.useCallback(function submit(value: string): void {
        if (!value || value.trim().length === 0) {
            return;
        }
        props.onQuery(value);
        setValue('');
    }, [props.context, props.onQuery, setValue]);

    const onKeyDown = React.useCallback((event: React.KeyboardEvent) => {
        if (!props.isEnabled) {
            return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit(editorRef.current?.document.textEditorModel.getValue() || '');
        }
    }, [props.isEnabled, submit]);

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
                text: '@',
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

    let rightOptions: Option[] = [];
    const { currentRequest: latestRequest, isEditing, pending, onResponseChanged } = props;
    React.useEffect(() => {
        if (!latestRequest) {
            return;
        }
        const disposable = latestRequest.response.onDidChange(onResponseChanged);
        return () => disposable.dispose();
    }, [latestRequest, onResponseChanged]);
    if (isEditing) {
        rightOptions = [{
            title: nls.localize('theia/ai/chat-ui/send', 'Send (Enter)'),
            handler: () => {
                if (props.isEnabled) {
                    submit(editorRef.current?.document.textEditorModel.getValue() || '');
                }
            },
            className: 'codicon-send',
            disabled: isInputEmpty || !props.isEnabled
        }];
    } else if (pending) {
        rightOptions = [{
            title: nls.localize('theia/ai/chat-ui/cancel', 'Cancel (Esc)'),
            handler: () => {
                if (latestRequest) {
                    props.onCancel(latestRequest);
                }
            },
            className: 'codicon-stop-circle'
        }];
    } else {
        rightOptions = [{
            title: nls.localize('theia/ai/chat-ui/send', 'Send (Enter)'),
            handler: () => {
                if (props.isEnabled) {
                    submit(editorRef.current?.document.textEditorModel.getValue() || '');
                }
            },
            className: 'codicon-send',
            disabled: isInputEmpty || !props.isEnabled
        }];
    }

    const contextUI = buildContextUI(props.context, props.labelProvider, props.onDeleteContextElement, props.onOpenContextElement);

    return <div className='theia-ChatInput' onDragOver={props.onDragOver} onDrop={props.onDrop}    >
        {props.showSuggestions !== false && <ChatInputAgentSuggestions suggestions={props.suggestions} opener={props.openerService} />}
        {props.showChangeSet && changeSetUI?.elements &&
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

const buildChangeSetUI = (
    changeSet: ChangeSet,
    labelProvider: LabelProvider,
    decoratorService: ChangeSetDecoratorService,
    actions: ChangeSetActionRenderer[],
    onDeleteChangeSet: () => void,
    onDeleteChangeSetElement: (uri: URI) => void
): ChangeSetUI | undefined => {
    const elements = changeSet.getElements();
    return elements.length ? ({
        title: changeSet.title,
        changeSet,
        deleteChangeSet: onDeleteChangeSet,
        elements: changeSet.getElements().map(element => toUiElement(element, onDeleteChangeSetElement, labelProvider, decoratorService)),
        actions
    }) : undefined;
};

interface ChangeSetUIElement {
    name: string;
    uri: string;
    iconClass: string;
    nameClass: string;
    additionalInfo: string;
    additionalInfoSuffixIcon?: string[];
    open?: () => void;
    openChange?: () => void;
    apply?: () => void;
    revert?: () => void;
    delete: () => void;
}

interface ChangeSetUI {
    changeSet: ChangeSet;
    title: string;
    deleteChangeSet: () => void;
    elements: ChangeSetUIElement[];
    actions: ChangeSetActionRenderer[];
}

/** Memo because the parent element rerenders on every key press in the chat widget. */
const ChangeSetBox: React.FunctionComponent<{ changeSet: ChangeSetUI }> = React.memo(({ changeSet: { changeSet, title, deleteChangeSet, elements, actions } }) => (
    <div className='theia-ChatInput-ChangeSet-Box'>
        <div className='theia-ChatInput-ChangeSet-Header'>
            <h3>{title}</h3>
            <div className='theia-ChatInput-ChangeSet-Header-Actions'>
                {actions.map(action => <div key={action.id} className='theia-changeSet-Action'>{action.render(changeSet)}</div>)}
                <span className='codicon codicon-close action' title={nls.localize('theia/ai/chat-ui/deleteChangeSet', 'Delete Change Set')} onClick={() => deleteChangeSet()} />
            </div>
        </div>
        <div className='theia-ChatInput-ChangeSet-List'>
            <ul>
                {elements.map(element => ChangeSetElement(element))}
            </ul>
        </div>
    </div>
));

function toUiElement(element: ChangeSetElement,
    onDeleteChangeSetElement: (uri: URI) => void,
    labelProvider: LabelProvider,
    decoratorService: ChangeSetDecoratorService
): ChangeSetUIElement {
    return ({
        open: element.open?.bind(element),
        uri: element.uri.toString(),
        iconClass: element.icon ?? labelProvider.getIcon(element.uri) ?? labelProvider.fileIcon,
        nameClass: `${element.type} ${element.state}`,
        name: element.name ?? labelProvider.getName(element.uri),
        additionalInfo: element.additionalInfo ?? labelProvider.getDetails(element.uri),
        additionalInfoSuffixIcon: decoratorService.getAdditionalInfoSuffixIcon(element),
        openChange: element?.openChange?.bind(element),
        apply: element.state !== 'applied' ? element?.apply?.bind(element) : undefined,
        revert: element.state === 'applied' || element.state === 'stale' ? element?.revert?.bind(element) : undefined,
        delete: () => onDeleteChangeSetElement(element.uri)
    } satisfies ChangeSetUIElement);
}

const ChangeSetElement: React.FC<ChangeSetUIElement> = element => (
    <li key={element.uri} title={nls.localize('theia/ai/chat-ui/openDiff', 'Open Diff')} onClick={() => element.openChange?.()}>
        <div className={`theia-ChatInput-ChangeSet-Icon ${element.iconClass}`}>
        </div>
        <div className='theia-ChatInput-ChangeSet-labelParts'>
            <span className={`theia-ChatInput-ChangeSet-title ${element.nameClass}`}>
                {element.name}
            </span>
            <div className='theia-ChatInput-ChangeSet-additionalInfo'>
                {element.additionalInfo && <span>{element.additionalInfo}</span>}
                {element.additionalInfoSuffixIcon
                    && <div className={`theia-ChatInput-ChangeSet-AdditionalInfo-SuffixIcon ${element.additionalInfoSuffixIcon.join(' ')}`}></div>}
            </div>
        </div>
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

function buildContextUI(
    context: readonly AIVariableResolutionRequest[] | undefined,
    labelProvider: LabelProvider,
    onDeleteContextElement: (index: number) => void,
    onOpen: OpenContextElement
): ChatContextUI {
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
            open: () => onOpen(element)
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
                    <div className="theia-ChatInput-ChatContext-labelParts">
                        <span className={`theia-ChatInput-ChatContext-title ${element.nameClass}`}>
                            {element.name}
                        </span>
                        <span className='theia-ChatInput-ChatContext-additionalInfo'>
                            {element.additionalInfo}
                        </span>
                    </div>
                    <span className="codicon codicon-close action" title={nls.localizeByDefault('Delete')} onClick={e => { e.stopPropagation(); element.delete(); }} />
                </li>
            ))}
        </ul>
    </div>
);
