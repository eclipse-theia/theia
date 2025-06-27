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
    ChangeSet, ChangeSetElement, ChatAgent, ChatChangeEvent, ChatHierarchyBranch,
    ChatModel, ChatRequestModel, ChatService, ChatSuggestion, EditableChatRequestModel
} from '@theia/ai-chat';
import { ChangeSetDecoratorService } from '@theia/ai-chat/lib/browser/change-set-decorator-service';
import { ImageContextVariable } from '@theia/ai-chat/lib/common/image-context-variable';
import { AIVariableResolutionRequest } from '@theia/ai-core';
import { AgentCompletionNotificationService, FrontendVariableService, AIActivationService } from '@theia/ai-core/lib/browser';
import { DisposableCollection, Emitter, InMemoryResources, URI, nls } from '@theia/core';
import { ContextMenuRenderer, LabelProvider, Message, OpenerService, ReactWidget } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { IMouseEvent, Range } from '@theia/monaco-editor-core';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { SimpleMonacoEditor } from '@theia/monaco/lib/browser/simple-monaco-editor';
import { ChangeSetActionRenderer, ChangeSetActionService } from './change-set-actions/change-set-action-service';
import { ChatInputAgentSuggestions } from './chat-input-agent-suggestions';
import { CHAT_VIEW_LANGUAGE_EXTENSION } from './chat-view-language-contribution';
import { ContextVariablePicker } from './context-variable-picker';
import { TASK_CONTEXT_VARIABLE } from '@theia/ai-chat/lib/browser/task-context-variable';
import { IModelDeltaDecoration } from '@theia/monaco-editor-core/esm/vs/editor/common/model';

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

    @inject(AgentCompletionNotificationService)
    protected readonly agentNotificationService: AgentCompletionNotificationService;

    @inject(ChangeSetDecoratorService)
    protected readonly changeSetDecoratorService: ChangeSetDecoratorService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(AIActivationService)
    protected readonly aiActivationService: AIActivationService;

    protected editorRef: SimpleMonacoEditor | undefined = undefined;
    protected readonly editorReady = new Deferred<void>();

    protected isEnabled = false;
    protected heightInLines = 12;

    protected _branch?: ChatHierarchyBranch;
    set branch(branch: ChatHierarchyBranch | undefined) {
        if (this._branch !== branch) {
            this._branch = branch;
            this.update();
        }
    }

    protected _onQuery: Query;
    set onQuery(query: Query) {
        this._onQuery = query;
    }
    protected _onUnpin: Unpin;
    set onUnpin(unpin: Unpin) {
        this._onUnpin = unpin;
    }
    protected _onCancel: Cancel;
    set onCancel(cancel: Cancel) {
        this._onCancel = cancel;
    }
    protected _onDeleteChangeSet: DeleteChangeSet;
    set onDeleteChangeSet(deleteChangeSet: DeleteChangeSet) {
        this._onDeleteChangeSet = deleteChangeSet;
    }
    protected _onDeleteChangeSetElement: DeleteChangeSetElement;
    set onDeleteChangeSetElement(deleteChangeSetElement: DeleteChangeSetElement) {
        this._onDeleteChangeSetElement = deleteChangeSetElement;
    }

    protected _initialValue?: string;
    set initialValue(value: string | undefined) {
        this._initialValue = value;
    }

    protected onDisposeForChatModel = new DisposableCollection();
    protected _chatModel: ChatModel;
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
    protected _pinnedAgent: ChatAgent | undefined;
    set pinnedAgent(pinnedAgent: ChatAgent | undefined) {
        this._pinnedAgent = pinnedAgent;
        this.update();
    }

    protected onDidResizeEmitter = new Emitter<void>();
    readonly onDidResize = this.onDidResizeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.id = AIChatInputWidget.ID;
        this.title.closable = false;
        this.toDispose.push(this.resources.add(this.getResourceUri(), ''));
        this.toDispose.push(this.aiActivationService.onDidChangeActiveStatus(() => {
            this.setEnabled(this.aiActivationService.isActive);
        }));
        this.toDispose.push(this.onDidResizeEmitter);
        this.setEnabled(this.aiActivationService.isActive);
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

    protected async handleAgentCompletion(request: ChatRequestModel): Promise<void> {
        try {
            const agentId = request.agentId;

            if (agentId) {
                await this.agentNotificationService.showCompletionNotification(agentId);
            }
        } catch (error) {
            console.error('Failed to handle agent completion notification:', error);
        }
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
                onPaste={this.onPaste.bind(this)}
                onEscape={this.onEscape.bind(this)}
                onDeleteChangeSet={this._onDeleteChangeSet.bind(this)}
                onDeleteChangeSetElement={this._onDeleteChangeSetElement.bind(this)}
                onAddContextElement={this.addContextElement.bind(this)}
                onDeleteContextElement={this.deleteContextElement.bind(this)}
                onOpenContextElement={this.openContextElement.bind(this)}
                context={this.getContext()}
                onAgentCompletion={this.handleAgentCompletion.bind(this)}
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
                heightInLines={this.heightInLines}
                onResponseChanged={() => {
                    if (isPending() !== pending) {
                        this.update();
                    }
                }}
                onResize={() => this.onDidResizeEmitter.fire()}
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

    protected onPaste(event: ClipboardEvent): void {
        this.variableService.getPasteResult(event, { type: 'ai-chat-input-widget' }).then(result => {
            result.variables.forEach(variable => this.addContext(variable));
            if (result.text) {
                const position = this.editorRef?.getControl().getPosition();
                if (position && result.text) {
                    this.editorRef?.getControl().executeEdits('paste', [{
                        range: {
                            startLineNumber: position.lineNumber,
                            startColumn: position.column,
                            endLineNumber: position.lineNumber,
                            endColumn: position.column
                        },
                        text: result.text
                    }]);
                }
            }
        });
    }

    protected onEscape(): void {
        // No op
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
    onPaste: (event: ClipboardEvent) => void;
    onDeleteChangeSet: (sessionId: string) => void;
    onDeleteChangeSetElement: (sessionId: string, uri: URI) => void;
    onAddContextElement: () => void;
    onDeleteContextElement: (index: number) => void;
    onEscape: () => void;
    onOpenContextElement: OpenContextElement;
    onAgentCompletion: (request: ChatRequestModel) => void;
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
    heightInLines?: number;
    onResponseChanged: () => void;
    onResize: () => void;
}

// Utility to check if we have task context in the chat model
const hasTaskContext = (chatModel: ChatModel): boolean => chatModel.context.getVariables().some(variable =>
    variable.variable?.id === TASK_CONTEXT_VARIABLE.id
);

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
    // eslint-disable-next-line no-null/no-null
    const containerRef = React.useRef<HTMLDivElement>(null);

    // On the first request of the chat, if the chat has a task context and a pinned
    // agent, show a "Perform this task." placeholder which is the message to send by default
    const isFirstRequest = props.chatModel.getRequests().length === 0;
    const shouldUseTaskPlaceholder = isFirstRequest && props.pinnedAgent && hasTaskContext(props.chatModel);
    const taskPlaceholder = nls.localize('theia/ai/chat-ui/performThisTask', 'Perform this task.');
    const placeholderText = !props.isEnabled
        ? nls.localize('theia/ai/chat-ui/aiDisabled', 'AI features are disabled')
        : shouldUseTaskPlaceholder
            ? taskPlaceholder
            : nls.localizeByDefault('Ask a question');

    // Handle paste events on the container
    const handlePaste = React.useCallback((event: ClipboardEvent) => {
        props.onPaste(event);
    }, [props.onPaste]);

    // Set up paste handler on the container div
    React.useEffect(() => {
        const container = containerRef.current;
        if (container) {
            container.addEventListener('paste', handlePaste, true);
            return () => {
                container.removeEventListener('paste', handlePaste, true);
            };
        }
        return undefined;
    }, [handlePaste]);

    React.useEffect(() => {
        const uri = props.uri;
        const createInputElement = async () => {
            const paddingTop = 6;
            const lineHeight = 20;
            const maxHeightPx = (props.heightInLines ?? 12) * lineHeight;

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

                editorContainerRef.current.addEventListener('wheel', e => {
                    // Prevent parent from scrolling
                    e.stopPropagation();
                }, { passive: false });
            }

            const updateEditorHeight = () => {
                if (editorContainerRef.current) {
                    const contentHeight = editor.getControl().getContentHeight() + paddingTop;
                    editorContainerRef.current.style.height = `${Math.min(contentHeight, maxHeightPx)}px`;
                }
            };

            editor.getControl().onDidChangeModelContent(() => {
                const value = editor.getControl().getValue();
                setIsInputEmpty(!value || value.length === 0);
                updateEditorHeight();
                handleOnChange();
            });
            const resizeObserver = new ResizeObserver(() => {
                updateEditorHeight();
                props.onResize();
            });
            if (editorContainerRef.current) {
                resizeObserver.observe(editorContainerRef.current);
            }
            editor.getControl().onDidDispose(() => {
                resizeObserver.disconnect();
            });

            editor.getControl().onContextMenu(e =>
                props.contextMenuCallback(e.event)
            );

            const updateLineCounts = () => {
                // We need the line numbers to allow scrolling by using the keyboard
                const model = editor.getControl().getModel()!;
                const lineCount = model.getLineCount();
                const decorations: IModelDeltaDecoration[] = [];

                for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
                    decorations.push({
                        range: new Range(lineNumber, 1, lineNumber, 1),
                        options: {
                            description: `line-number-${lineNumber}`,
                            isWholeLine: false,
                            className: `line-number-${lineNumber}`,
                        }
                    });
                }

                const lineNumbers = model.getAllDecorations().filter(predicate => predicate.options.description?.startsWith('line-number-'));
                editor.getControl().removeDecorations(lineNumbers.map(d => d.id));
                editor.getControl().createDecorationsCollection(decorations);
            };

            editor.getControl().getModel()?.onDidChangeContent(() => {
                updateLineCounts();
            });

            editor.getControl().onDidChangeCursorPosition(e => {
                const lineNumber = e.position.lineNumber;
                const line = editor.getControl().getDomNode()?.querySelector(`.line-number-${lineNumber}`);
                line?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
            });

            editorRef.current = editor;
            props.setEditorRef(editor);

            if (props.initialValue) {
                setValue(props.initialValue);
            }

            updateLineCounts();
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
            if (event.kind === 'addRequest') {
                // Listen for when this request's response becomes complete
                const responseListener = event.request.response.onDidChange(() => {
                    if (event.request.response.isComplete) {
                        props.onAgentCompletion(event.request);
                        responseListener.dispose(); // Clean up the listener once notification is sent
                    }
                });
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
    }, [props.actionService, props.chatModel.changeSet]);

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

    // Without user input, if we can default to "Perform this task.", do so
    const submit = React.useCallback(function submit(value: string): void {
        let effectiveValue = value;
        if ((!value || value.trim().length === 0) && shouldUseTaskPlaceholder) {
            effectiveValue = taskPlaceholder;
        }
        if (!effectiveValue || effectiveValue.trim().length === 0) {
            return;
        }
        props.onQuery(effectiveValue);
        setValue('');
        if (editorRef.current && !editorRef.current.document.textEditorModel.isDisposed()) {
            editorRef.current.document.textEditorModel.setValue('');
        }
    }, [props.context, props.onQuery, setValue, shouldUseTaskPlaceholder, taskPlaceholder]);

    const onKeyDown = React.useCallback((event: React.KeyboardEvent) => {
        if (!props.isEnabled) {
            return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            // On Enter, read input and submit (handles task context)
            const currentValue = editorRef.current?.document.textEditorModel.getValue() || '';
            submit(currentValue);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            props.onEscape();
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
                className: 'codicon-add',
                disabled: !props.isEnabled
            }]
            : []),
        ...(props.showPinnedAgent
            ? [{
                title: props.pinnedAgent ? nls.localize('theia/ai/chat-ui/unpinAgent', 'Unpin Agent') : nls.localize('theia/ai/chat-ui/pinAgent', 'Pin Agent'),
                handler: props.pinnedAgent ? props.onUnpin : handlePin,
                className: 'at-icon',
                disabled: !props.isEnabled,
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
            disabled: (isInputEmpty && !shouldUseTaskPlaceholder) || !props.isEnabled
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
            disabled: (isInputEmpty && !shouldUseTaskPlaceholder) || !props.isEnabled
        }];
    }

    const contextUI = buildContextUI(props.context, props.labelProvider, props.onDeleteContextElement, props.onOpenContextElement);

    return (
        <div className='theia-ChatInput' data-ai-disabled={!props.isEnabled} onDragOver={props.onDragOver} onDrop={props.onDrop} ref={containerRef}>
            {props.showSuggestions !== false && <ChatInputAgentSuggestions suggestions={props.suggestions} opener={props.openerService} />}
            {props.showChangeSet && changeSetUI?.elements &&
                <ChangeSetBox changeSet={changeSetUI} />
            }
            <div className='theia-ChatInput-Editor-Box'>
                <div className='theia-ChatInput-Editor' ref={editorContainerRef} onKeyDown={onKeyDown} onFocus={handleInputFocus} onBlur={handleInputBlur}>
                    <div ref={placeholderRef} className='theia-ChatInput-Editor-Placeholder'>{placeholderText}</div>
                </div>
                {props.context && props.context.length > 0 &&
                    <ChatContext context={contextUI.context} />
                }
                <ChatInputOptions leftOptions={leftOptions} rightOptions={rightOptions} />
            </div>
        </div>
    );
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
                    className={`option${option.disabled ? ' disabled' : ''}${option.text?.align === 'right' ? ' reverse' : ''}`}
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
                    className={`option${option.disabled ? ' disabled' : ''}${option.text?.align === 'right' ? ' reverse' : ''}`}
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
            variable: element,
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
        variable: AIVariableResolutionRequest,
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
            {context.map((element, index) => {
                if (ImageContextVariable.isImageContextRequest(element.variable)) {
                    const variable = ImageContextVariable.parseRequest(element.variable)!;
                    return <li key={index} className="theia-ChatInput-ChatContext-Element theia-ChatInput-ImageContext-Element"
                        title={variable.name ?? variable.wsRelativePath} onClick={() => element.open?.()}>
                        <div className="theia-ChatInput-ChatContext-Row">
                            <div className={`theia-ChatInput-ChatContext-Icon ${element.iconClass}`} />
                            <div className="theia-ChatInput-ChatContext-labelParts">
                                <span className={`theia-ChatInput-ChatContext-title ${element.nameClass}`}>
                                    {variable.name ?? variable.wsRelativePath?.split('/').pop()}
                                </span>
                                <span className='theia-ChatInput-ChatContext-additionalInfo'>
                                    {element.additionalInfo}
                                </span>
                            </div>
                            <span className="codicon codicon-close action" title={nls.localizeByDefault('Delete')} onClick={e => { e.stopPropagation(); element.delete(); }} />
                        </div>
                        <div className="theia-ChatInput-ChatContext-ImageRow">
                            <div className='theia-ChatInput-ImagePreview-Item'>
                                <img src={`data:${variable.mimeType};base64,${variable.data}`} alt={variable.name} />
                            </div>
                        </div>
                    </li>;
                }
                return <li key={index} className="theia-ChatInput-ChatContext-Element" title={element.details} onClick={() => element.open?.()}>
                    <div className="theia-ChatInput-ChatContext-Row">
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
                    </div>
                </li>;
            })}
        </ul>
    </div>
);
