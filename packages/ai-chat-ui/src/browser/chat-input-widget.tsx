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
    ChatModel, ChatRequestModel, ChatService, ChatSuggestion, EditableChatRequestModel,
    ChatRequestParser, ChatMode
} from '@theia/ai-chat';
import { ChangeSetDecoratorService } from '@theia/ai-chat/lib/browser/change-set-decorator-service';
import { ImageContextVariable } from '@theia/ai-chat/lib/common/image-context-variable';
import { AIVariableResolutionRequest } from '@theia/ai-core';
import { AgentCompletionNotificationService, FrontendVariableService, AIActivationService } from '@theia/ai-core/lib/browser';
import { DisposableCollection, Emitter, InMemoryResources, URI, nls, Disposable } from '@theia/core';
import { ContextMenuRenderer, LabelProvider, Message, OpenerService, ReactWidget } from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
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
import { EditorOption } from '@theia/monaco-editor-core/esm/vs/editor/common/config/editorOptions';
import { ChatInputHistoryService, ChatInputNavigationState } from './chat-input-history';
import { ContextFileValidationService, FileValidationResult, FileValidationState } from '@theia/ai-chat/lib/browser/context-file-validation-service';

type Query = (query: string, mode?: string) => Promise<void>;
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
    enablePromptHistory?: boolean;
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

    @inject(ChatInputHistoryService)
    protected readonly historyService: ChatInputHistoryService;

    @inject(ChatRequestParser)
    protected readonly chatRequestParser: ChatRequestParser;

    @inject(ContextFileValidationService) @optional()
    protected readonly validationService: ContextFileValidationService | undefined;

    protected fileValidationState = new Map<string, FileValidationResult>();

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    protected navigationState: ChatInputNavigationState;

    protected editorRef: SimpleMonacoEditor | undefined = undefined;
    protected readonly editorReady = new Deferred<void>();

    get editor(): SimpleMonacoEditor | undefined {
        return this.editorRef;
    }

    get inputConfiguration(): AIChatInputConfiguration | undefined {
        return this.configuration;
    }

    getPreviousPrompt(currentInput: string): string | undefined {
        if (!this.navigationState) {
            return undefined;
        }
        return this.navigationState.getPreviousPrompt(currentInput);
    }

    getNextPrompt(): string | undefined {
        if (!this.navigationState) {
            return undefined;
        }
        return this.navigationState.getNextPrompt();
    }

    cycleMode(): void {
        if (!this.receivingAgent || !this.receivingAgent.modes || this.receivingAgent.modes.length <= 1) {
            return;
        }
        const currentIndex = this.receivingAgent.modes.findIndex(mode => mode.id === this.receivingAgent!.currentModeId);
        const nextIndex = currentIndex === -1 ? 1 : (currentIndex + 1) % this.receivingAgent.modes.length;
        this.receivingAgent = {
            ...this.receivingAgent,
            currentModeId: this.receivingAgent.modes[nextIndex].id
        };
        this.update();
    }

    protected handleModeChange = (mode: string): void => {
        if (this.receivingAgent) {
            this.receivingAgent = { ...this.receivingAgent, currentModeId: mode };
            this.update();
        }
    };

    protected chatInputFocusKey: ContextKey<boolean>;
    protected chatInputFirstLineKey: ContextKey<boolean>;
    protected chatInputLastLineKey: ContextKey<boolean>;
    protected chatInputReceivingAgentKey: ContextKey<string>;
    protected chatInputHasModesKey: ContextKey<boolean>;

    protected isEnabled = false;
    protected heightInLines = 12;

    protected updateReceivingAgentTimeout: number | undefined;
    protected receivingAgent: {
        agentId: string;
        modes: ChatMode[];
        currentModeId?: string;
    } | undefined;

    protected _branch?: ChatHierarchyBranch;
    set branch(branch: ChatHierarchyBranch | undefined) {
        if (this._branch !== branch) {
            this._branch = branch;
            this.update();
        }
    }

    protected _onQuery: Query;
    set onQuery(query: Query) {
        this._onQuery = (prompt: string, mode?: string) => {
            if (this.configuration?.enablePromptHistory !== false && prompt.trim()) {
                this.historyService.addToHistory(prompt);
                this.navigationState.stopNavigation();
            }
            return query(prompt, mode);
        };
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
            if (event.kind === 'addVariable') {
                // Validate files added via any path (including LLM tool calls)
                // Get the current variables and validate any new file variables
                const variables = chatModel.context.getVariables();
                variables.forEach(variable => {
                    if (variable.variable.name === 'file' && variable.arg) {
                        const pathKey = variable.arg; // Use the original path as the key
                        // Revalidate the file each time someone (User or LLM) adds it to the context,
                        // as the state may change over time.
                        if (this.validationService) {
                            this.validationService.validateFile(pathKey).then(result => {
                                this.fileValidationState.set(pathKey, result);
                                this.update();
                            });
                        }
                    }
                });
                this.update();
            } else if (event.kind === 'addRequest') {
                // Only clear image context variables, preserve other context (e.g., attached files)
                // Never clear on parse failure.
                const variables = chatModel.context.getVariables();
                const imageIndices = variables
                    .map((v, i) => {
                        const origin = ImageContextVariable.getOriginSafe(v);
                        return origin === 'temporary' ? i : -1;
                    })
                    .filter(i => i !== -1);
                if (imageIndices.length > 0) {
                    chatModel.context.deleteVariables(...imageIndices);
                }
                this.update();
            } else if (event.kind === 'removeVariable' || event.kind === 'changeHierarchyBranch') {
                this.update();
            }
        }));
        this._chatModel = chatModel;
        this.scheduleUpdateReceivingAgent();
        this.update();
    }
    protected _pinnedAgent: ChatAgent | undefined;
    set pinnedAgent(pinnedAgent: ChatAgent | undefined) {
        this._pinnedAgent = pinnedAgent;
        this.scheduleUpdateReceivingAgent();
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
        this.toDispose.push(Disposable.create(() => {
            if (this.updateReceivingAgentTimeout !== undefined) {
                clearTimeout(this.updateReceivingAgentTimeout);
                this.updateReceivingAgentTimeout = undefined;
            }
        }));
        this.setEnabled(this.aiActivationService.isActive);
        this.historyService.init().then(() => {
            this.navigationState = new ChatInputNavigationState(this.historyService);
        });
        this.initializeContextKeys();
        this.update();
    }

    protected initializeContextKeys(): void {
        this.chatInputFocusKey = this.contextKeyService.createKey<boolean>('chatInputFocus', false);
        this.chatInputFirstLineKey = this.contextKeyService.createKey<boolean>('chatInputFirstLine', false);
        this.chatInputLastLineKey = this.contextKeyService.createKey<boolean>('chatInputLastLine', false);
        this.chatInputReceivingAgentKey = this.contextKeyService.createKey<string>('chatInputReceivingAgent', '');
        this.chatInputHasModesKey = this.contextKeyService.createKey<boolean>('chatInputHasModes', false);
    }

    updateCursorPositionKeys(): void {
        if (!this.editorRef) {
            this.chatInputFirstLineKey.set(false);
            this.chatInputLastLineKey.set(false);
            return;
        }

        const editor = this.editorRef.getControl();
        const position = editor.getPosition();
        const model = editor.getModel();

        if (!position || !model) {
            this.chatInputFirstLineKey.set(false);
            this.chatInputLastLineKey.set(false);
            return;
        }

        const line = position.lineNumber;
        const col = position.column;

        const topAtPos = editor.getTopForPosition(line, col);
        const topAtLineStart = editor.getTopForLineNumber(line);
        const topAtLineEnd = editor.getTopForPosition(line, model.getLineMaxColumn(line));
        const lineHeight = editor.getOption(EditorOption.lineHeight);
        const toleranceValue = 0.5;

        const isFirstVisualOfThisLine = Math.abs(topAtPos - topAtLineStart) < toleranceValue;
        const isLastVisualOfThisLine = Math.abs(topAtPos - topAtLineEnd) < toleranceValue || (topAtPos > topAtLineEnd - lineHeight + toleranceValue);
        const isFirstVisualOverall = line === 1 && isFirstVisualOfThisLine;

        const isLastVisualOverall = line === model.getLineCount() && isLastVisualOfThisLine;

        this.chatInputFirstLineKey.set(isFirstVisualOverall);
        this.chatInputLastLineKey.set(isLastVisualOverall);
    }

    protected scheduleUpdateReceivingAgent(): void {
        if (this.updateReceivingAgentTimeout !== undefined) {
            clearTimeout(this.updateReceivingAgentTimeout);
        }
        this.updateReceivingAgentTimeout = window.setTimeout(() => {
            this.updateReceivingAgent();
            this.updateReceivingAgentTimeout = undefined;
        }, 200);
    }

    protected async updateReceivingAgent(): Promise<void> {
        if (!this.editorRef || !this._chatModel) {
            if (this.receivingAgent !== undefined) {
                this.chatInputReceivingAgentKey.set('');
                this.chatInputHasModesKey.set(false);
                this.receivingAgent = undefined;
                this.update();
            }
            return;
        }

        try {
            const inputText = this.editorRef.getControl().getValue();
            const request = { text: inputText };
            const resolvedContext = { variables: [] };
            const parsedRequest = await this.chatRequestParser.parseChatRequest(request, this._chatModel.location, resolvedContext);
            const session = this.chatService.getSessions().find(s => s.model.id === this._chatModel.id);
            if (session) {
                const agent = this.chatService.getAgent(parsedRequest, session);
                const agentId = agent?.id ?? '';
                const previousAgentId = this.receivingAgent?.agentId;

                this.chatInputReceivingAgentKey.set(agentId);

                // Only update and re-render when the agent changes
                if (agent && agentId !== previousAgentId) {
                    const modes = agent.modes ?? [];
                    const defaultMode = modes.find(m => m.isDefault);
                    const initialModeId = defaultMode?.id;
                    this.receivingAgent = {
                        agentId: agentId,
                        modes,
                        currentModeId: initialModeId
                    };
                    this.chatInputHasModesKey.set(modes.length > 1);
                    this.update();
                } else if (!agent && this.receivingAgent !== undefined) {
                    this.receivingAgent = undefined;
                    this.chatInputHasModesKey.set(false);
                    this.update();
                }
            } else if (this.receivingAgent !== undefined) {
                this.chatInputReceivingAgentKey.set('');
                this.chatInputHasModesKey.set(false);
                this.receivingAgent = undefined;
                this.update();
            }
        } catch (error) {
            console.warn('Failed to determine receiving agent:', error);
            if (this.receivingAgent !== undefined) {
                this.chatInputReceivingAgentKey.set('');
                this.chatInputHasModesKey.set(false);
                this.receivingAgent = undefined;
                this.update();
            }
        }
    }

    protected setupEditorEventListeners(): void {
        if (!this.editorRef) {
            return;
        }

        const editor = this.editorRef.getControl();

        this.toDispose.push(editor.onDidFocusEditorWidget(() => {
            this.chatInputFocusKey.set(true);
            this.updateCursorPositionKeys();
        }));

        this.toDispose.push(editor.onDidBlurEditorWidget(() => {
            this.chatInputFocusKey.set(false);
            this.chatInputFirstLineKey.set(false);
            this.chatInputLastLineKey.set(false);
        }));

        this.toDispose.push(editor.onDidChangeCursorPosition(() => {
            if (editor.hasWidgetFocus()) {
                this.updateCursorPositionKeys();
            }
        }));

        this.toDispose.push(editor.onDidChangeModelContent(() => {
            if (editor.hasWidgetFocus()) {
                this.updateCursorPositionKeys();
            }
            this.scheduleUpdateReceivingAgent();
        }));

        if (editor.hasWidgetFocus()) {
            this.chatInputFocusKey.set(true);
            this.updateCursorPositionKeys();
        }
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
                fileValidationState={this.fileValidationState}
                onAgentCompletion={this.handleAgentCompletion.bind(this)}
                chatModel={this._chatModel}
                pinnedAgent={this._pinnedAgent}
                editorProvider={this.editorProvider}
                uri={this.getResourceUri()}
                contextMenuCallback={this.handleContextMenu.bind(this)}
                isEnabled={this.isEnabled}
                setEditorRef={editor => {
                    this.editorRef = editor;
                    this.setupEditorEventListeners();
                    this.editorReady.resolve();
                    this.scheduleUpdateReceivingAgent();
                }}
                showContext={this.configuration?.showContext}
                showPinnedAgent={this.configuration?.showPinnedAgent}
                showChangeSet={this.configuration?.showChangeSet}
                showSuggestions={this.configuration?.showSuggestions}
                hasPromptHistory={this.configuration?.enablePromptHistory}
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
                modeSelectorProps={{
                    receivingAgentModes: this.receivingAgent?.modes,
                    currentMode: this.receivingAgent?.currentModeId,
                    onModeChange: this.handleModeChange,
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
        const currentRequest = this._branch?.items?.at(-1)?.element ?? this._chatModel.getRequests().at(-1);
        if (currentRequest && !EditableChatRequestModel.isEditing(currentRequest) && ChatRequestModel.isInProgress(currentRequest)) {
            this._onCancel(currentRequest);
        }
    }

    protected async openContextElement(request: AIVariableResolutionRequest): Promise<void> {
        // Re-validate file before opening
        if (request.variable.name === 'file' && request.arg) {
            if (this.validationService) {
                const result = await this.validationService.validateFile(request.arg);
                this.fileValidationState.set(request.arg, result);
                this.update();
            }
        }
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
        // Validation happens in the chatModel.onDidChange listener
        this._chatModel.context.addVariables(variable);
    }

    protected getContext(): readonly AIVariableResolutionRequest[] {
        return this._chatModel.context.getVariables();
    }
}

interface ChatInputProperties {
    branch?: ChatHierarchyBranch;
    onCancel: (requestModel: ChatRequestModel) => void;
    onQuery: (query: string, mode?: string) => void;
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
    fileValidationState: Map<string, FileValidationResult>;
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
    hasPromptHistory?: boolean;
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
    modeSelectorProps: {
        receivingAgentModes?: ChatMode[];
        currentMode?: string;
        onModeChange: (mode: string) => void;
    }
}

// Utility to check if we have task context in the chat model
const hasTaskContext = (chatModel: ChatModel): boolean => chatModel.context.getVariables().some(variable =>
    variable.variable?.id === TASK_CONTEXT_VARIABLE.id
);

const ChatInput: React.FunctionComponent<ChatInputProperties> = (props: ChatInputProperties) => {
    const onDeleteChangeSet = () => props.onDeleteChangeSet(props.chatModel.id);
    const onDeleteChangeSetElement = (uri: URI) => props.onDeleteChangeSetElement(props.chatModel.id, uri);

    const [isInputEmpty, setIsInputEmpty] = React.useState(true);
    const [isInputFocused, setIsInputFocused] = React.useState(false);
    const [placeholderText, setPlaceholderText] = React.useState('');
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

    // Update placeholder text when focus state or other dependencies change
    React.useEffect(() => {
        const newPlaceholderText = !props.isEnabled
            ? nls.localize('theia/ai/chat-ui/aiDisabled', 'AI features are disabled')
            : shouldUseTaskPlaceholder
                ? taskPlaceholder
                // eslint-disable-next-line max-len
                : nls.localize('theia/ai/chat-ui/askQuestion', 'Ask a question') + (props.hasPromptHistory && isInputFocused ? nls.localizeByDefault(' ({0} for history)', '⇅') : '');
        setPlaceholderText(newPlaceholderText);
    }, [props.isEnabled, shouldUseTaskPlaceholder, taskPlaceholder, props.hasPromptHistory, isInputFocused]);

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
                ariaLabel: nls.localize('theia/ai/chat-ui/chatInputAriaLabel', 'Type your message here'),
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
        props.onQuery(effectiveValue, props.modeSelectorProps.currentMode);
        setValue('');
        if (editorRef.current && !editorRef.current.document.textEditorModel.isDisposed()) {
            editorRef.current.document.textEditorModel.setValue('');
            editorRef.current.focus();
        }
    }, [props.context, props.onQuery, props.modeSelectorProps.currentMode, setValue, shouldUseTaskPlaceholder, taskPlaceholder]);

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
        setIsInputFocused(true);
        hidePlaceholderIfEditorFilled();
    };

    const handleOnChange = () => {
        showPlaceholderIfEditorEmpty();
        hidePlaceholderIfEditorFilled();
    };

    const handleInputBlur = () => {
        setIsInputFocused(false);
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
                title: props.pinnedAgent ? nls.localize('theia/ai/chat-ui/unpinAgent', 'Unpin Agent') : nls.localize('theia/ai/chat-ui/agent', 'Agent'),
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

    const contextUI = buildContextUI(props.context, props.labelProvider, props.onDeleteContextElement, props.onOpenContextElement, props.fileValidationState);

    // Show mode selector if agent has multiple modes
    const showModeSelector = (props.modeSelectorProps.receivingAgentModes?.length ?? 0) > 1;

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
                <ChatInputOptions
                    leftOptions={leftOptions}
                    rightOptions={rightOptions}
                    isEnabled={props.isEnabled}
                    modeSelectorProps={{
                        show: showModeSelector,
                        modes: props.modeSelectorProps.receivingAgentModes,
                        currentMode: props.modeSelectorProps.currentMode,
                        onModeChange: props.modeSelectorProps.onModeChange,
                    }}
                />
            </div>
        </div>
    );
};

interface ChatInputOptionsProps {
    leftOptions: Option[];
    rightOptions: Option[];
    isEnabled?: boolean;
    modeSelectorProps: {
        show: boolean;
        modes?: ChatMode[];
        currentMode?: string;
        onModeChange: (mode: string) => void;
    };
}

const ChatInputOptions: React.FunctionComponent<ChatInputOptionsProps> = ({
    leftOptions,
    rightOptions,
    isEnabled,
    modeSelectorProps
}) => (
    // Right options are rendered first in DOM for tab order (send button first when enabled)
    // CSS order property positions them visually (left on left, right on right)
    <div className="theia-ChatInputOptions">
        <div className="theia-ChatInputOptions-right">
            {rightOptions.map((option, index) => (
                <span
                    key={index}
                    className={`option${option.disabled ? ' disabled' : ''}${option.text?.align === 'right' ? ' reverse' : ''}`}
                    title={option.title}
                    aria-label={option.title}
                    role='button'
                    tabIndex={option.disabled ? -1 : 0}
                    onClick={option.handler}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            option.handler();
                        }
                    }}
                >
                    <span>{option.text?.content}</span>
                    <span className={`codicon ${option.className}`} />
                </span>
            ))}
        </div>
        <div className="theia-ChatInputOptions-left">
            {leftOptions.map((option, index) => (
                <span
                    key={index}
                    className={`option${option.disabled ? ' disabled' : ''}${option.text?.align === 'right' ? ' reverse' : ''}`}
                    title={option.title}
                    aria-label={option.title}
                    role='button'
                    tabIndex={option.disabled ? -1 : 0}
                    onClick={option.handler}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            option.handler();
                        }
                    }}
                >
                    <span>{option.text?.content}</span>
                    <span className={`codicon ${option.className}`} />
                </span>
            ))}
            {modeSelectorProps.show && modeSelectorProps.modes && (
                <ChatModeSelector
                    modes={modeSelectorProps.modes}
                    currentMode={modeSelectorProps.currentMode}
                    onModeChange={modeSelectorProps.onModeChange}
                    disabled={!isEnabled}
                />
            )}
        </div>
    </div>
);

interface ChatModeSelectorProps {
    modes: ChatMode[];
    currentMode?: string;
    onModeChange: (mode: string) => void;
    disabled?: boolean;
}

const ChatModeSelector: React.FunctionComponent<ChatModeSelectorProps> = React.memo(({ modes, currentMode, onModeChange, disabled }) => (
    <select
        className="theia-ChatInput-ModeSelector"
        value={currentMode ?? modes[0]?.id ?? ''}
        onChange={e => onModeChange(e.target.value)}
        disabled={disabled}
        title={modes.find(m => m.id === (currentMode ?? modes[0]?.id))?.name}
    >
        {modes.map(mode => (
            <option key={mode.id} value={mode.id} title={mode.name}>
                {mode.name}
            </option>
        ))}
    </select>
));

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
const ChangeSetBox: React.FunctionComponent<{ changeSet: ChangeSetUI }> = React.memo(({ changeSet: { changeSet, title, deleteChangeSet, elements, actions } }) => {
    const [isCollapsed, setIsCollapsed] = React.useState(false);

    const toggleCollapse = React.useCallback(() => {
        setIsCollapsed(prev => !prev);
    }, []);

    const handleToggleKeyDown = React.useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleCollapse();
            }
        },
        [toggleCollapse]
    );

    return (
        <div className='theia-ChatInput-ChangeSet-Box'>
            <div className='theia-ChatInput-ChangeSet-Header'>
                <div className='theia-ChatInput-ChangeSet-Header-Title'>
                    <span
                        className={`codicon ${isCollapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'} theia-ChatInput-ChangeSet-Toggle`}
                        onClick={toggleCollapse}
                        onKeyDown={handleToggleKeyDown}
                        role='button'
                        tabIndex={0}
                        aria-expanded={!isCollapsed}
                        aria-label={
                            isCollapsed
                                ? nls.localize('theia/ai/chat-ui/expandChangeSet', 'Expand Change Set')
                                : nls.localize('theia/ai/chat-ui/collapseChangeSet', 'Collapse Change Set')
                        }
                        title={
                            isCollapsed
                                ? nls.localize('theia/ai/chat-ui/expandChangeSet', 'Expand Change Set')
                                : nls.localize('theia/ai/chat-ui/collapseChangeSet', 'Collapse Change Set')
                        }
                    />
                    <h3>{title}</h3>
                </div>
                <div className='theia-ChatInput-ChangeSet-Header-Actions'>
                    {actions.map(action => (
                        <div key={action.id} className='theia-changeSet-Action'>
                            {action.render(changeSet)}
                        </div>
                    ))}
                    <span
                        className='codicon codicon-close action'
                        title={nls.localize('theia/ai/chat-ui/deleteChangeSet', 'Delete Change Set')}
                        onClick={() => deleteChangeSet()}
                    />
                </div>
            </div>
            <div className={`theia-ChatInput-ChangeSet-List ${isCollapsed ? 'collapsed' : 'expanded'}`}>
                <ul>
                    {elements.map(element => ChangeSetElement(element))}
                </ul>
            </div>
        </div>
    );
});

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

function buildContextUI(
    context: readonly AIVariableResolutionRequest[] | undefined,
    labelProvider: LabelProvider,
    onDeleteContextElement: (index: number) => void,
    onOpen: OpenContextElement,
    fileValidationState: Map<string, FileValidationResult>
): ChatContextUI {
    if (!context) {
        return { context: [] };
    }
    return {
        context: context.map((element, index) => {
            // Check if this is an invalid file
            let className: string | undefined;
            let validationMessage: string | undefined;
            if (element.variable.name === 'file' && element.arg) {
                // Use the path directly as the key (same as storage)
                const validationResult = fileValidationState.get(element.arg);
                if (validationResult) {
                    if (validationResult.state === FileValidationState.INVALID_SECONDARY) {
                        className = 'warning-file';
                        validationMessage = validationResult.message;
                    } else if (validationResult.state === FileValidationState.INVALID_NOT_FOUND) {
                        className = 'invalid-file';
                        validationMessage = validationResult.message;
                    }
                }
            }
            return {
                variable: element,
                name: labelProvider.getName(element),
                iconClass: labelProvider.getIcon(element),
                nameClass: element.variable.name,
                className,
                validationMessage,
                additionalInfo: labelProvider.getDetails(element),
                details: labelProvider.getLongName(element),
                delete: () => onDeleteContextElement(index),
                open: () => onOpen(element)
            };
        })
    };
}

interface ChatContextUI {
    context: {
        variable: AIVariableResolutionRequest,
        name: string;
        iconClass: string;
        nameClass: string;
        className?: string;
        validationMessage?: string;
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
                    let variable: ImageContextVariable | undefined;
                    try {
                        variable = ImageContextVariable.parseRequest(element.variable);
                    } catch {
                        variable = undefined;
                    }

                    const title = variable?.name ?? variable?.wsRelativePath ?? element.details ?? element.name;
                    const label = variable?.name ?? variable?.wsRelativePath?.split('/').pop() ?? element.name;

                    return <li key={index} className="theia-ChatInput-ChatContext-Element theia-ChatInput-ImageContext-Element"
                        title={title} onClick={() => element.open?.()}>
                        <div className="theia-ChatInput-ChatContext-Row">
                            <div className={`theia-ChatInput-ChatContext-Icon ${element.iconClass}`} />
                            <div className="theia-ChatInput-ChatContext-labelParts">
                                <span className={`theia-ChatInput-ChatContext-title ${element.nameClass}`}>
                                    {label}
                                </span>
                                <span className='theia-ChatInput-ChatContext-additionalInfo'>
                                    {element.additionalInfo}
                                </span>
                            </div>
                            <span className="codicon codicon-close action" title={nls.localizeByDefault('Delete')} onClick={e => { e.stopPropagation(); element.delete(); }} />
                        </div>
                        {variable && <div className="theia-ChatInput-ChatContext-ImageRow">
                            <div className='theia-ChatInput-ImagePreview-Item'>
                                <img src={`data:${variable.mimeType};base64,${variable.data}`} alt={variable.name ?? label} />
                            </div>
                        </div>}
                    </li>;
                }
                const isWarning = element.className === 'warning-file';
                const isInvalid = element.className === 'invalid-file';
                const tooltipTitle = element.validationMessage ?? element.details;
                return <li key={index} className={`theia-ChatInput-ChatContext-Element ${element.className || ''}`} title={tooltipTitle} onClick={() => element.open?.()}>
                    <div className="theia-ChatInput-ChatContext-Row">
                        {isWarning && <span className="codicon codicon-warning warning-file-icon" />}
                        {isInvalid && <span className="codicon codicon-error invalid-file-icon" />}
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
