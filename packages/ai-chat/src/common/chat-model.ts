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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Partially copied from https://github.com/microsoft/vscode/blob/a2cab7255c0df424027be05d58e1b7b941f4ea60/src/vs/workbench/contrib/chat/common/chatModel.ts

import {
    AIVariableResolutionRequest,
    LanguageModelMessage,
    ResolvedAIContextVariable,
    TextMessage,
    ThinkingMessage,
    ToolCallResult,
    ToolResultMessage,
    ToolUseMessage
} from '@theia/ai-core';
import { ArrayUtils, CancellationToken, CancellationTokenSource, Command, Disposable, DisposableCollection, Emitter, Event, generateUuid, URI } from '@theia/core';
import { MarkdownString, MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import { Position } from '@theia/core/shared/vscode-languageserver-protocol';
import { ChangeSet, ChangeSetElement, ChangeSetImpl, ChatUpdateChangeSetEvent } from './change-set';
import { ChatAgentLocation } from './chat-agents';
import { ParsedChatRequest } from './parsed-chat-request';
import debounce = require('@theia/core/shared/lodash.debounce');
export { ChangeSet, ChangeSetElement, ChangeSetImpl };

/**********************
 * INTERFACES AND TYPE GUARDS
 **********************/

export type ChatChangeEvent =
    | ChatAddRequestEvent
    | ChatAddResponseEvent
    | ChatAddVariableEvent
    | ChatRemoveVariableEvent
    | ChatSetVariablesEvent
    | ChatRemoveRequestEvent
    | ChatSuggestionsChangedEvent
    | ChatUpdateChangeSetEvent
    | ChatEditRequestEvent
    | ChatEditCancelEvent
    | ChatEditSubmitEvent
    | ChatChangeHierarchyBranchEvent;

export interface ChatAddRequestEvent {
    kind: 'addRequest';
    request: ChatRequestModel;
}

export interface ChatEditRequestEvent {
    kind: 'enableEdit';
    request: EditableChatRequestModel;
    branch: ChatHierarchyBranch<ChatRequestModel>;
}

export interface ChatEditCancelEvent {
    kind: 'cancelEdit';
    request: EditableChatRequestModel;
    branch: ChatHierarchyBranch<ChatRequestModel>;
}

export interface ChatEditSubmitEvent {
    kind: 'submitEdit';
    request: EditableChatRequestModel;
    branch: ChatHierarchyBranch<ChatRequestModel>;
    newRequest: ChatRequest;
}

export interface ChatChangeHierarchyBranchEvent {
    kind: 'changeHierarchyBranch';
    branch: ChatHierarchyBranch<ChatRequestModel>;
}

export interface ChatAddResponseEvent {
    kind: 'addResponse';
    response: ChatResponseModel;
}

export interface ChatAddVariableEvent {
    kind: 'addVariable';
}

export interface ChatRemoveVariableEvent {
    kind: 'removeVariable';
}

export interface ChatSetVariablesEvent {
    kind: 'setVariables';
}

export interface ChatSuggestionsChangedEvent {
    kind: 'suggestionsChanged';
    suggestions: ChatSuggestion[];
}

export namespace ChatChangeEvent {
    export function isChangeSetEvent(event: ChatChangeEvent): event is ChatUpdateChangeSetEvent {
        return event.kind === 'updateChangeSet';
    }
}

export type ChatRequestRemovalReason = 'removal' | 'resend' | 'adoption';

export interface ChatRemoveRequestEvent {
    kind: 'removeRequest';
    requestId: string;
    responseId?: string;
    reason: ChatRequestRemovalReason;
}

/**
 * A model that contains information about a chat request that may branch off.
 *
 * The hierarchy of requests is represented by a tree structure.
 * - The root of the tree is the initial request
 * - Within each branch, the requests are stored in a list. Those requests are the alternatives to the original request.
 *   Each of those items can have a next branch, which is the next request in the hierarchy.
 */
export interface ChatRequestHierarchy<TRequest extends ChatRequestModel = ChatRequestModel> extends Disposable {
    readonly branch: ChatHierarchyBranch<TRequest>

    onDidChange: Event<ChangeActiveBranchEvent<TRequest>>;

    append(request: TRequest): ChatHierarchyBranch<TRequest>;
    activeRequests(): TRequest[];
    activeBranches(): ChatHierarchyBranch<TRequest>[];
    findRequest(requestId: string): TRequest | undefined;
    findBranch(requestId: string): ChatHierarchyBranch<TRequest> | undefined;

    notifyChange(event: ChangeActiveBranchEvent<TRequest>): void
}

export interface ChangeActiveBranchEvent<TRequest extends ChatRequestModel = ChatRequestModel> {
    branch: ChatHierarchyBranch<TRequest>,
    item: ChatHierarchyBranchItem<TRequest>
}

/**
 * A branch of the chat request hierarchy.
 * It contains a list of items, each representing a request.
 * Those items can have a next branch, which is the next request in the hierarchy.
 */
export interface ChatHierarchyBranch<TRequest extends ChatRequestModel = ChatRequestModel> extends Disposable {
    readonly id: string;
    readonly hierarchy: ChatRequestHierarchy<TRequest>;
    readonly previous?: ChatHierarchyBranch<TRequest>;
    readonly items: ChatHierarchyBranchItem<TRequest>[];
    readonly activeBranchIndex: number;

    next(): ChatHierarchyBranch<TRequest> | undefined;
    get(): TRequest;
    add(request: TRequest): void;
    remove(request: TRequest | string): void;
    /**
     * Create a new branch by inserting it as the next branch of the active item.
     */
    continue(request: TRequest): ChatHierarchyBranch<TRequest>;

    enable(request: TRequest): ChatHierarchyBranchItem<TRequest>;
    enablePrevious(): ChatHierarchyBranchItem<TRequest>;
    enableNext(): ChatHierarchyBranchItem<TRequest>;

    succeedingBranches(): ChatHierarchyBranch<TRequest>[];
}

export interface ChatHierarchyBranchItem<TRequest extends ChatRequestModel = ChatRequestModel> {
    readonly element: TRequest;
    readonly next?: ChatHierarchyBranch<TRequest>;
}

export interface ChatModel {
    readonly onDidChange: Event<ChatChangeEvent>;
    readonly id: string;
    readonly location: ChatAgentLocation;
    readonly context: ChatContextManager;
    readonly suggestions: readonly ChatSuggestion[];
    readonly settings?: { [key: string]: unknown };
    readonly changeSet: ChangeSet;
    getRequests(): ChatRequestModel[];
    getBranches(): ChatHierarchyBranch<ChatRequestModel>[];
    isEmpty(): boolean;
}

export interface ChatSuggestionCallback {
    kind: 'callback',
    callback: () => unknown;
    content: string | MarkdownString;
}
export namespace ChatSuggestionCallback {
    export function is(candidate: ChatSuggestion): candidate is ChatSuggestionCallback {
        return typeof candidate === 'object' && 'callback' in candidate;
    }
    export function containsCallbackLink(candidate: ChatSuggestion): candidate is ChatSuggestionCallback {
        if (!is(candidate)) { return false; }
        const text = typeof candidate.content === 'string' ? candidate.content : candidate.content.value;
        return text.includes('](_callback)');
    }
}

export type ChatSuggestion = | string | MarkdownString | ChatSuggestionCallback;

export interface ChatContextManager {
    onDidChange: Event<ChatAddVariableEvent | ChatRemoveVariableEvent | ChatSetVariablesEvent>;
    getVariables(): readonly AIVariableResolutionRequest[]
    addVariables(...variables: AIVariableResolutionRequest[]): void;
    deleteVariables(...indices: number[]): void;
    clear(): void;
}

export interface ChangeSetDecoration {
    readonly priority?: number;
    readonly additionalInfoSuffixIcon?: string[];
}

export interface ChatRequest {
    readonly text: string;
    readonly displayText?: string;
    /**
     * If the request has been triggered in the context of
     * an existing request, this id will be set to the id of the
     * referenced request.
     */
    readonly referencedRequestId?: string;
    readonly variables?: readonly AIVariableResolutionRequest[];
}

export interface ChatContext {
    variables: ResolvedAIContextVariable[];
}

export interface ChatRequestModel {
    readonly id: string;
    readonly session: ChatModel;
    readonly request: ChatRequest;
    readonly response: ChatResponseModel;
    readonly message: ParsedChatRequest;
    readonly context: ChatContext;
    readonly agentId?: string;
    readonly data?: { [key: string]: unknown };
}

export namespace ChatRequestModel {
    export function is(request: unknown): request is ChatRequestModel {
        return !!(
            request &&
            typeof request === 'object' &&
            'id' in request &&
            typeof (request as { id: unknown }).id === 'string' &&
            'session' in request &&
            'request' in request &&
            'response' in request &&
            'message' in request
        );
    }
    export function isInProgress(request: ChatRequestModel | undefined): boolean {
        if (!request) {
            return false;
        }
        const response = request.response;
        return !(
            response.isComplete ||
            response.isCanceled ||
            response.isError
        );
    }
}

export interface EditableChatRequestModel extends ChatRequestModel {
    readonly isEditing: boolean;
    editContextManager: ChatContextManagerImpl;
    enableEdit(): void;
    cancelEdit(): void;
    submitEdit(newRequest: ChatRequest): void;
}

export namespace EditableChatRequestModel {
    export function is(request: unknown): request is EditableChatRequestModel {
        return !!(
            ChatRequestModel.is(request) &&
            'enableEdit' in request &&
            'cancelEdit' in request &&
            'submitEdit' in request
        );
    }

    export function isEditing(request: unknown): request is EditableChatRequestModel {
        return is(request) && request.isEditing;
    }
}

export interface ChatProgressMessage {
    kind: 'progressMessage';
    id: string;
    status: 'inProgress' | 'completed' | 'failed';
    show: 'untilFirstContent' | 'whileIncomplete' | 'forever';
    content: string;
}

export interface ChatResponseContent {
    kind: string;
    /**
     * Represents the content as a string. Returns `undefined` if the content
     * is purely informational and/or visual and should not be included in the overall
     * representation of the response.
     */
    asString?(): string | undefined;
    asDisplayString?(): string | undefined;
    merge?(nextChatResponseContent: ChatResponseContent): boolean;
    toLanguageModelMessage?(): LanguageModelMessage | LanguageModelMessage[];
}

export namespace ChatResponseContent {
    export function is(obj: unknown): obj is ChatResponseContent {
        return !!(
            obj &&
            typeof obj === 'object' &&
            'kind' in obj &&
            typeof (obj as { kind: unknown }).kind === 'string'
        );
    }
    export function hasAsString(
        obj: ChatResponseContent
    ): obj is Required<Pick<ChatResponseContent, 'asString'>> & ChatResponseContent {
        return typeof obj.asString === 'function';
    }
    export function hasDisplayString(
        obj: ChatResponseContent
    ): obj is Required<Pick<ChatResponseContent, 'asDisplayString'>> & ChatResponseContent {
        return typeof obj.asDisplayString === 'function';
    }
    export function hasMerge(
        obj: ChatResponseContent
    ): obj is Required<Pick<ChatResponseContent, 'merge'>> & ChatResponseContent {
        return typeof obj.merge === 'function';
    }
    export function hasToLanguageModelMessage(
        obj: ChatResponseContent
    ): obj is Required<Pick<ChatResponseContent, 'toLanguageModelMessage'>> & ChatResponseContent {
        return typeof obj.toLanguageModelMessage === 'function';
    }
}

export interface TextChatResponseContent
    extends Required<ChatResponseContent> {
    kind: 'text';
    content: string;
}

export interface ErrorChatResponseContent extends ChatResponseContent {
    kind: 'error';
    error: Error;
}

export interface MarkdownChatResponseContent
    extends Required<ChatResponseContent> {
    kind: 'markdownContent';
    content: MarkdownString;
}

export interface CodeChatResponseContent
    extends ChatResponseContent {
    kind: 'code';
    code: string;
    language?: string;
    location?: Location;
}

export interface HorizontalLayoutChatResponseContent extends ChatResponseContent {
    kind: 'horizontal';
    content: ChatResponseContent[];
}

export interface ToolCallChatResponseContent extends Required<ChatResponseContent> {
    kind: 'toolCall';
    id?: string;
    name?: string;
    arguments?: string;
    finished: boolean;
    result?: ToolCallResult;
    confirmed: Promise<boolean>;
    confirm(): void;
    deny(): void;
}

export interface ThinkingChatResponseContent
    extends Required<ChatResponseContent> {
    kind: 'thinking';
    content: string;
    signature: string;
}

export interface ProgressChatResponseContent
    extends Required<ChatResponseContent> {
    kind: 'progress';
    message: string;
}

export interface Location {
    uri: URI;
    position: Position;
}
export namespace Location {
    export function is(obj: unknown): obj is Location {
        return !!obj && typeof obj === 'object' &&
            'uri' in obj && (obj as { uri: unknown }).uri instanceof URI &&
            'position' in obj && Position.is((obj as { position: unknown }).position);
    }
}

export interface CustomCallback {
    label: string;
    callback: () => Promise<void>;
}

/**
 * A command chat response content represents a command that is offered to the user for execution.
 * It either refers to an already registered Theia command or provides a custom callback.
 * If both are given, the custom callback will be preferred.
 */
export interface CommandChatResponseContent extends ChatResponseContent {
    kind: 'command';
    command?: Command;
    customCallback?: CustomCallback;
    arguments?: unknown[];
}

/**
 * An informational chat response content represents a message that is purely informational and should not be included in the overall representation of the response.
 */
export interface InformationalChatResponseContent extends ChatResponseContent {
    kind: 'informational';
    content: MarkdownString;
}

export namespace TextChatResponseContent {
    export function is(obj: unknown): obj is TextChatResponseContent {
        return (
            ChatResponseContent.is(obj) &&
            obj.kind === 'text' &&
            'content' in obj &&
            typeof (obj as { content: unknown }).content === 'string'
        );
    }
}

export namespace MarkdownChatResponseContent {
    export function is(obj: unknown): obj is MarkdownChatResponseContent {
        return (
            ChatResponseContent.is(obj) &&
            obj.kind === 'markdownContent' &&
            'content' in obj &&
            MarkdownString.is((obj as { content: unknown }).content)
        );
    }
}

export namespace InformationalChatResponseContent {
    export function is(obj: unknown): obj is InformationalChatResponseContent {
        return (
            ChatResponseContent.is(obj) &&
            obj.kind === 'informational' &&
            'content' in obj &&
            MarkdownString.is((obj as { content: unknown }).content)
        );
    }
}

export namespace CommandChatResponseContent {
    export function is(obj: unknown): obj is CommandChatResponseContent {
        return (
            ChatResponseContent.is(obj) &&
            obj.kind === 'command' &&
            'command' in obj &&
            Command.is((obj as { command: unknown }).command)
        );
    }
}

export namespace CodeChatResponseContent {
    export function is(obj: unknown): obj is CodeChatResponseContent {
        return (
            ChatResponseContent.is(obj) &&
            obj.kind === 'code' &&
            'code' in obj &&
            typeof (obj as { code: unknown }).code === 'string'
        );
    }
}

export namespace HorizontalLayoutChatResponseContent {
    export function is(
        obj: unknown
    ): obj is HorizontalLayoutChatResponseContent {
        return (
            ChatResponseContent.is(obj) &&
            obj.kind === 'horizontal' &&
            'content' in obj &&
            Array.isArray((obj as { content: unknown }).content) &&
            (obj as { content: unknown[] }).content.every(
                ChatResponseContent.is
            )
        );
    }
}

export namespace ToolCallChatResponseContent {
    export function is(obj: unknown): obj is ToolCallChatResponseContent {
        return ChatResponseContent.is(obj) && obj.kind === 'toolCall';
    }
}

export namespace ErrorChatResponseContent {
    export function is(obj: unknown): obj is ErrorChatResponseContent {
        return (
            ChatResponseContent.is(obj) &&
            obj.kind === 'error' &&
            'error' in obj &&
            obj.error instanceof Error
        );
    }
}

export namespace ThinkingChatResponseContent {
    export function is(obj: unknown): obj is ThinkingChatResponseContent {
        return (
            ChatResponseContent.is(obj) &&
            obj.kind === 'thinking' &&
            'content' in obj &&
            typeof obj.content === 'string'
        );
    }
}

export namespace ProgressChatResponseContent {
    export function is(obj: unknown): obj is ProgressChatResponseContent {
        return (
            ChatResponseContent.is(obj) &&
            obj.kind === 'progress' &&
            'message' in obj &&
            typeof obj.message === 'string'
        );
    }
}

export type QuestionResponseHandler = (
    selectedOption: { text: string, value?: string },
) => void;

export interface QuestionResponseContent extends ChatResponseContent {
    kind: 'question';
    question: string;
    options: { text: string, value?: string }[];
    selectedOption?: { text: string, value?: string };
    handler: QuestionResponseHandler;
    request: MutableChatRequestModel;
}

export namespace QuestionResponseContent {
    export function is(obj: unknown): obj is QuestionResponseContent {
        return (
            ChatResponseContent.is(obj) &&
            obj.kind === 'question' &&
            'question' in obj &&
            typeof (obj as { question: unknown }).question === 'string' &&
            'options' in obj &&
            Array.isArray((obj as { options: unknown }).options) &&
            (obj as { options: unknown[] }).options.every(option =>
                typeof option === 'object' &&
                option && 'text' in option &&
                typeof (option as { text: unknown }).text === 'string' &&
                ('value' in option ? typeof (option as { value: unknown }).value === 'string' || typeof (option as { value: unknown }).value === 'undefined' : true)
            ) &&
            'handler' in obj &&
            typeof (obj as { handler: unknown }).handler === 'function' &&
            'request' in obj &&
            obj.request instanceof MutableChatRequestModel
        );
    }
}

export interface ChatResponse {
    readonly content: ChatResponseContent[];
    asString(): string;
    asDisplayString(): string;
}

/**
 * The ChatResponseModel wraps the actual ChatResponse with additional information like the current state, progress messages, a unique id etc.
 */
export interface ChatResponseModel {
    /**
     * Use this to be notified for any change in the response model
     */
    readonly onDidChange: Event<void>;
    /**
     * The unique identifier of the response model
     */
    readonly id: string;
    /**
     * The unique identifier of the request model this response is associated with
     */
    readonly requestId: string;
    /**
     * In case there are progress messages, then they will be stored here
     */
    readonly progressMessages: ChatProgressMessage[];
    /**
     * The actual response content
     */
    readonly response: ChatResponse;
    /**
     * Indicates whether this response is complete. No further changes are expected if 'true'.
     */
    readonly isComplete: boolean;
    /**
     * Indicates whether this response is canceled. No further changes are expected if 'true'.
     */
    readonly isCanceled: boolean;
    /**
     * Some agents might need to wait for user input to continue. This flag indicates that.
     */
    readonly isWaitingForInput: boolean;
    /**
     * Indicates whether an error occurred when processing the response. No further changes are expected if 'true'.
     */
    readonly isError: boolean;
    /**
     * The agent who produced the response content, if there is one.
     */
    readonly agentId?: string
    /**
     * An optional error object that caused the response to be in an error state.
     */
    readonly errorObject?: Error;
    /**
     * Some functionality might want to store some data associated with the response.
     * This can be used to store and retrieve such data.
     */
    readonly data: { [key: string]: unknown };
}

/**********************
 * Implementations
 **********************/

export class MutableChatModel implements ChatModel, Disposable {
    protected readonly _onDidChangeEmitter = new Emitter<ChatChangeEvent>();
    onDidChange: Event<ChatChangeEvent> = this._onDidChangeEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    protected _hierarchy: ChatRequestHierarchy<MutableChatRequestModel>;
    protected _id: string;
    protected _suggestions: readonly ChatSuggestion[] = [];
    protected readonly _contextManager = new ChatContextManagerImpl();
    protected readonly _changeSet: ChatTreeChangeSet;
    protected _settings: { [key: string]: unknown };

    constructor(public readonly location = ChatAgentLocation.Panel) {
        // TODO accept serialized data as a parameter to restore a previously saved ChatModel
        this._hierarchy = new ChatRequestHierarchyImpl<MutableChatRequestModel>();
        this._changeSet = new ChatTreeChangeSet(this._hierarchy);
        this.toDispose.push(this._changeSet);
        this._changeSet.onDidChange(this._onDidChangeEmitter.fire, this._onDidChangeEmitter, this.toDispose);
        this._id = generateUuid();

        this.toDispose.pushAll([
            this._onDidChangeEmitter,
            this._contextManager.onDidChange(this._onDidChangeEmitter.fire, this._onDidChangeEmitter),
            this._hierarchy.onDidChange(event => {
                this._onDidChangeEmitter.fire({
                    kind: 'changeHierarchyBranch',
                    branch: event.branch,
                });
            }),
        ]);
    }

    get id(): string {
        return this._id;
    }

    get changeSet(): ChangeSet {
        return this._changeSet;
    }

    getBranches(): ChatHierarchyBranch<ChatRequestModel>[] {
        return this._hierarchy.activeBranches();
    }

    getBranch(requestId: string): ChatHierarchyBranch<ChatRequestModel> | undefined {
        return this._hierarchy.findBranch(requestId);
    }

    getRequests(): MutableChatRequestModel[] {
        return this._hierarchy.activeRequests();
    }

    getRequest(id: string): MutableChatRequestModel | undefined {
        return this.getRequests().find(request => request.id === id);
    }

    get suggestions(): readonly ChatSuggestion[] {
        return this._suggestions;
    }

    get context(): ChatContextManager {
        return this._contextManager;
    }

    get settings(): { [key: string]: unknown } {
        return this._settings;
    }

    setSettings(settings: { [key: string]: unknown }): void {
        this._settings = settings;
    }

    addRequest(parsedChatRequest: ParsedChatRequest, agentId?: string, context: ChatContext = { variables: [] }): MutableChatRequestModel {
        const add = this.getTargetForRequestAddition(parsedChatRequest);
        const requestModel = new MutableChatRequestModel(this, parsedChatRequest, agentId, context);
        requestModel.onDidChange(event => {
            if (!ChatChangeEvent.isChangeSetEvent(event)) {
                this._onDidChangeEmitter.fire(event);
            }
        }, this, this.toDispose);

        add(requestModel);
        this._changeSet.registerRequest(requestModel);

        this._onDidChangeEmitter.fire({
            kind: 'addRequest',
            request: requestModel,
        });
        return requestModel;
    }

    protected getTargetForRequestAddition(request: ParsedChatRequest): (addendum: MutableChatRequestModel) => void {
        const requestId = request.request.referencedRequestId;
        const branch = requestId !== undefined && this._hierarchy.findBranch(requestId);
        if (requestId !== undefined && !branch) { throw new Error(`Cannot find branch for requestId: ${requestId}`); }
        return branch ? branch.add.bind(branch) : this._hierarchy.append.bind(this._hierarchy);
    }

    setSuggestions(suggestions: ChatSuggestion[]): void {
        this._suggestions = Object.freeze(suggestions);
        this._onDidChangeEmitter.fire({
            kind: 'suggestionsChanged',
            suggestions
        });
    }

    isEmpty(): boolean {
        return this.getRequests().length === 0;
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}

export class ChatTreeChangeSet implements Omit<ChangeSet, 'onDidChange'> {
    protected readonly onDidChangeEmitter = new Emitter<ChatUpdateChangeSetEvent>();
    get onDidChange(): Event<ChatUpdateChangeSetEvent> {
        return this.onDidChangeEmitter.event;
    }

    protected readonly toDispose = new DisposableCollection();

    constructor(protected readonly hierarchy: ChatRequestHierarchy<MutableChatRequestModel>) {
        hierarchy.onDidChange(this.handleChangeSetChange, this, this.toDispose);
    }

    get title(): string {
        return this.getCurrentChangeSet()?.title ?? '';
    }

    removeElements(...uris: URI[]): boolean {
        return this.getMutableChangeSet().removeElements(...uris);
    }

    addElements(...elements: ChangeSetElement[]): boolean {
        return this.getMutableChangeSet().addElements(...elements);
    }

    setElements(...elements: ChangeSetElement[]): void {
        this.getMutableChangeSet().setElements(...elements);
    }

    setTitle(title: string): void {
        this.getMutableChangeSet().setTitle(title);
    }

    getElementByURI(uri: URI): ChangeSetElement | undefined {
        return this.currentElements.find(candidate => candidate.uri.isEqual(uri));
    }

    protected currentElements: ChangeSetElement[] = [];
    protected handleChangeSetChange = debounce(this.doHandleChangeSetChange.bind(this), 100, { leading: false, trailing: true });
    protected doHandleChangeSetChange(): void {
        const newElements = this.computeChangeSetElements();
        this.handleElementChange(newElements);
        this.currentElements = newElements;
        this.onDidChangeEmitter.fire({ kind: 'updateChangeSet', elements: this.currentElements, title: this.getCurrentChangeSet()?.title });
    }

    getElements(): ChangeSetElement[] {
        return this.currentElements;
    }

    protected computeChangeSetElements(): ChangeSetElement[] {
        const allElements = ChangeSetImpl.combine((function* (requests: MutableChatRequestModel[]): IterableIterator<ChangeSetImpl> {
            for (let i = requests.length - 1; i >= 0; i--) {
                const changeSet = requests[i].changeSet;
                if (changeSet) { yield changeSet; }
            }
        })(this.hierarchy.activeRequests()));
        return ArrayUtils.coalesce(Array.from(allElements.values()));
    }

    protected handleElementChange(newElements: ChangeSetElement[]): void {
        const old = new Set(this.currentElements);
        for (const element of newElements) {
            if (!old.delete(element)) {
                element.onShow?.();
            }
        }
        for (const element of old) {
            element.onHide?.();
        }
    }

    protected toDisposeOnRequestAdded = new DisposableCollection();
    registerRequest(request: MutableChatRequestModel): void {
        request.onDidChange(event => event.kind === 'updateChangeSet' && this.handleChangeSetChange(), this, this.toDispose);
        if (this.localChangeSet) {
            request.changeSet = this.localChangeSet;
            this.localChangeSet = undefined;
        }
        this.toDisposeOnRequestAdded.dispose();
    }

    protected localChangeSet?: ChangeSetImpl;
    protected getMutableChangeSet(): ChangeSetImpl {
        const tipRequest = this.hierarchy.activeRequests().at(-1);
        const existingChangeSet = tipRequest?.changeSet;
        if (existingChangeSet) {
            return existingChangeSet;
        }
        if (this.localChangeSet && tipRequest) {
            throw new Error('Non-empty chat model retained reference to own change set. This is unexpected!');
        }
        if (this.localChangeSet) {
            return this.localChangeSet;
        }
        const newChangeSet = new ChangeSetImpl();
        if (tipRequest) {
            tipRequest.changeSet = newChangeSet;
        } else {
            this.localChangeSet = newChangeSet;
            newChangeSet.onDidChange(this.handleChangeSetChange, this, this.toDisposeOnRequestAdded);
        }
        return newChangeSet;
    }

    protected getCurrentChangeSet(): ChangeSet | undefined {
        const holder = this.getBranchParent(candidate => !!candidate.get().changeSet);
        return holder?.get().changeSet ?? this.localChangeSet;
    }

    /** Returns the lowest node among active nodes that satisfies {@link criterion} */
    getBranchParent(criterion: (branch: ChatHierarchyBranch<MutableChatRequestModel>) => boolean): ChatHierarchyBranch<MutableChatRequestModel> | undefined {
        const branches = this.hierarchy.activeBranches();
        for (let i = branches.length - 1; i >= 0; i--) {
            const branch = branches[i];
            if (criterion?.(branch)) { return branch; }
        }
        return branches.at(0);
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}

export class ChatRequestHierarchyImpl<TRequest extends ChatRequestModel = ChatRequestModel> implements ChatRequestHierarchy<TRequest> {
    protected readonly onDidChangeActiveBranchEmitter = new Emitter<ChangeActiveBranchEvent<TRequest>>();
    readonly onDidChange = this.onDidChangeActiveBranchEmitter.event;

    readonly branch: ChatHierarchyBranch<TRequest> = new ChatRequestHierarchyBranchImpl<TRequest>(this);

    append(request: TRequest): ChatHierarchyBranch<TRequest> {
        const branches = this.activeBranches();

        if (branches.length === 0) {
            this.branch.add(request);
            return this.branch;
        }

        return branches.at(-1)!.continue(request);
    }

    activeRequests(): TRequest[] {
        return this.activeBranches().map(h => h.get());
    }

    activeBranches(): ChatHierarchyBranch<TRequest>[] {
        return Array.from(this.iterateBranches());
    }

    protected *iterateBranches(): Generator<ChatHierarchyBranch<TRequest>> {
        let current: ChatHierarchyBranch<TRequest> | undefined = this.branch;
        while (current) {
            if (current.items.length > 0) {
                yield current;
                current = current.next();
            } else {
                break;
            }
        }
    }

    findRequest(requestId: string): TRequest | undefined {
        const branch = this.findInBranch(this.branch, requestId);
        return branch?.items.find(item => item.element.id === requestId)?.element;
    }

    findBranch(requestId: string): ChatHierarchyBranch<TRequest> | undefined {
        return this.findInBranch(this.branch, requestId);
    }

    protected findInBranch(branch: ChatHierarchyBranch<TRequest>, requestId: string): ChatHierarchyBranch<TRequest> | undefined {
        for (const item of branch.items) {
            if (item.element.id === requestId) {
                return branch;
            }
        }
        for (const item of branch.items) {
            if (item.next) {
                const found = this.findInBranch(item.next, requestId);
                if (found) {
                    return found;
                }
            }
        }
        return undefined;
    }

    notifyChange(event: ChangeActiveBranchEvent<TRequest>): void {
        this.onDidChangeActiveBranchEmitter.fire(event);
    }

    dispose(): void {
        this.onDidChangeActiveBranchEmitter.dispose();
        this.branch.dispose();
    }
}

export class ChatRequestHierarchyBranchImpl<TRequest extends ChatRequestModel> implements ChatHierarchyBranch<TRequest> {
    readonly id = generateUuid();

    constructor(
        readonly hierarchy: ChatRequestHierarchy<TRequest>,
        readonly previous?: ChatHierarchyBranch<TRequest>,
        readonly items: ChatHierarchyBranchItem<TRequest>[] = [],
        protected _activeIndex = -1
    ) { }

    get activeBranchIndex(): number {
        return this._activeIndex;
    }

    protected set activeBranchIndex(value: number) {
        this._activeIndex = value;
        this.hierarchy.notifyChange({
            branch: this,
            item: this.items[this._activeIndex]
        });
    }

    next(): ChatHierarchyBranch<TRequest> | undefined {
        return this.items[this.activeBranchIndex]?.next;
    }

    get(): TRequest {
        return this.items[this.activeBranchIndex].element;
    }

    add(request: TRequest): void {
        const branch: ChatHierarchyBranchItem<TRequest> = {
            element: request
        };
        this.items.push(branch);
        this.activeBranchIndex = this.items.length - 1;
    }

    remove(request: TRequest | string): void {
        const requestId = typeof request === 'string' ? request : request.id;
        const index = this.items.findIndex(version => version.element.id === requestId);
        if (index !== -1) {
            this.items.splice(index, 1);
            if (this.activeBranchIndex >= index) {
                this.activeBranchIndex--;
            }
        }
    }

    continue(request: TRequest): ChatHierarchyBranch<TRequest> {
        if (this.items.length === 0) {
            this.add(request);
            return this;
        }

        const item = this.items[this.activeBranchIndex];

        if (item) {
            const next = new ChatRequestHierarchyBranchImpl(this.hierarchy, this, [{ element: request }], 0);
            this.items[this.activeBranchIndex] = {
                ...item,
                next
            };
            return next;
        }

        throw new Error(`No current branch to continue from. Active Index: ${this.activeBranchIndex}`);
    }

    enable(request: TRequest): ChatHierarchyBranchItem<TRequest> {
        this.activeBranchIndex = this.items.findIndex(pred => pred.element.id === request.id);
        return this.items[this.activeBranchIndex];
    }

    enablePrevious(): ChatHierarchyBranchItem<TRequest> {
        if (this.activeBranchIndex > 0) {
            this.activeBranchIndex--;
            return this.items[this.activeBranchIndex];
        }
        return this.items[0];
    }

    enableNext(): ChatHierarchyBranchItem<TRequest> {
        if (this.activeBranchIndex < this.items.length - 1) {
            this.activeBranchIndex++;
            return this.items[this.activeBranchIndex];
        }

        return this.items[this.activeBranchIndex];
    }

    succeedingBranches(): ChatHierarchyBranch<TRequest>[] {
        const branches: ChatHierarchyBranch<TRequest>[] = [];

        let current: ChatHierarchyBranch<TRequest> | undefined = this;
        while (current !== undefined) {
            branches.push(current);
            current = current.next();
        }

        return branches;
    }

    dispose(): void {
        if (Disposable.is(this.get())) {
            this.items.forEach(({ element }) => Disposable.is(element) && element.dispose());
        }
        this.items.length = 0;
    }
}

export class ChatContextManagerImpl implements ChatContextManager {
    protected readonly variables = new Array<AIVariableResolutionRequest>();
    protected readonly onDidChangeEmitter = new Emitter<ChatAddVariableEvent | ChatRemoveVariableEvent | ChatSetVariablesEvent>();
    get onDidChange(): Event<ChatAddVariableEvent | ChatRemoveVariableEvent | ChatSetVariablesEvent> {
        return this.onDidChangeEmitter.event;
    }

    constructor(context?: ChatContext) {
        if (context) {
            this.variables.push(...context.variables.map(AIVariableResolutionRequest.fromResolved));
        }
    }

    getVariables(): readonly AIVariableResolutionRequest[] {
        const result = this.variables.slice();
        Object.freeze(result);
        return result;
    }

    addVariables(...variables: AIVariableResolutionRequest[]): void {
        let modified = false;
        variables.forEach(variable => {
            if (this.variables.some(existing => existing.variable.id === variable.variable.id && existing.arg === variable.arg)) {
                return;
            }
            this.variables.push(variable);
            modified = true;
        });
        if (modified) {
            this.onDidChangeEmitter.fire({ kind: 'addVariable' });
        }
    }

    deleteVariables(...indices: number[]): void {
        const toDelete = indices.filter(candidate => candidate <= this.variables.length).sort((left, right) => right - left);
        if (toDelete.length) {
            toDelete.forEach(index => {
                this.variables.splice(index, 1);
            });
            this.onDidChangeEmitter.fire({ kind: 'removeVariable' });
        }
    }

    setVariables(variables: AIVariableResolutionRequest[]): void {
        this.variables.length = 0;
        variables.forEach(variable => {
            if (this.variables.some(existing => existing.variable.id === variable.variable.id && existing.arg === variable.arg)) {
                return;
            }
            this.variables.push(variable);
        });
        this.onDidChangeEmitter.fire({ kind: 'setVariables' });
    }

    clear(): void {
        if (this.variables.length) {
            this.variables.length = 0;
            this.onDidChangeEmitter.fire({ kind: 'removeVariable' });
        }
    }
}

export class MutableChatRequestModel implements ChatRequestModel, EditableChatRequestModel, Disposable {
    protected readonly _onDidChangeEmitter = new Emitter<ChatChangeEvent>();
    onDidChange: Event<ChatChangeEvent> = this._onDidChangeEmitter.event;
    protected readonly _id: string;
    protected _session: MutableChatModel;
    protected _request: ChatRequest;
    protected _response: MutableChatResponseModel;
    protected _changeSet?: ChangeSetImpl;
    protected _context: ChatContext;
    protected _agentId?: string;
    protected _data: { [key: string]: unknown };
    protected _isEditing = false;

    protected readonly toDispose = new DisposableCollection();
    readonly editContextManager: ChatContextManagerImpl;

    constructor(session: MutableChatModel, public readonly message: ParsedChatRequest, agentId?: string,
        context: ChatContext = { variables: [] }, data: { [key: string]: unknown } = {}) {
        // TODO accept serialized data as a parameter to restore a previously saved ChatRequestModel
        this._request = message.request;
        this._id = generateUuid();
        this._session = session;
        this._response = new MutableChatResponseModel(this._id, agentId);
        this._context = context;
        this._agentId = agentId;
        this._data = data;

        this.editContextManager = new ChatContextManagerImpl(context);
        this.editContextManager.onDidChange(this._onDidChangeEmitter.fire, this._onDidChangeEmitter, this.toDispose);
        this.toDispose.push(this._onDidChangeEmitter);
    }

    get changeSet(): ChangeSetImpl | undefined {
        return this._changeSet;
    }

    set changeSet(changeSet: ChangeSetImpl) {
        this._changeSet?.dispose();
        this._changeSet = changeSet;
        this.toDispose.push(changeSet);
        changeSet.onDidChange(() => this._onDidChangeEmitter.fire({ kind: 'updateChangeSet', elements: changeSet.getElements(), title: changeSet.title }), this, this.toDispose);
        this._onDidChangeEmitter.fire({ kind: 'updateChangeSet', elements: changeSet.getElements(), title: changeSet.title });
    }

    get isEditing(): boolean {
        return this._isEditing;
    }

    enableEdit(): void {
        this._isEditing = true;
        this.emitEditRequest(this);
    }

    get data(): { [key: string]: unknown } | undefined {
        return this._data;
    }

    addData(key: string, value: unknown): void {
        this._data[key] = value;
    }

    getDataByKey<T = unknown>(key: string): T {
        return this._data[key] as T;
    }

    removeData(key: string): void {
        delete this._data[key];
    }

    get id(): string {
        return this._id;
    }

    get session(): MutableChatModel {
        return this._session;
    }

    get request(): ChatRequest {
        return this._request;
    }

    get response(): MutableChatResponseModel {
        return this._response;
    }

    get context(): ChatContext {
        return this._context;
    }

    get agentId(): string | undefined {
        return this._agentId;
    }

    cancelEdit(): void {
        if (this.isEditing) {
            this._isEditing = false;
            this.emitCancelEdit(this);

            this.clearEditContext();
        }
    }

    submitEdit(newRequest: ChatRequest): void {
        if (this.isEditing) {
            this._isEditing = false;
            const variables = this.editContextManager.getVariables() ?? [];

            this.emitSubmitEdit(this, {
                ...newRequest,
                referencedRequestId: this.id,
                variables
            });

            this.clearEditContext();
        }
    }

    cancel(): void {
        this.response.cancel();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected clearEditContext(): void {
        this.editContextManager.setVariables(this.context.variables.map(AIVariableResolutionRequest.fromResolved));
    }

    protected emitEditRequest(request: MutableChatRequestModel): void {
        const branch = this.session.getBranch(request.id);
        if (!branch) {
            throw new Error(`Cannot find hierarchy for requestId: ${request.id}`);
        }
        this._onDidChangeEmitter.fire({
            kind: 'enableEdit',
            request,
            branch,
        });
    }

    protected emitCancelEdit(request: MutableChatRequestModel): void {
        const branch = this.session.getBranch(request.id);
        if (!branch) {
            throw new Error(`Cannot find branch for requestId: ${request.id}`);
        }
        this._onDidChangeEmitter.fire({
            kind: 'cancelEdit',
            request,
            branch,
        });
    }

    protected emitSubmitEdit(request: MutableChatRequestModel, newRequest: ChatRequest): void {
        const branch = this.session.getBranch(request.id);
        if (!branch) {
            throw new Error(`Cannot find branch for requestId: ${request.id}`);
        }
        this._onDidChangeEmitter.fire({
            kind: 'submitEdit',
            request,
            branch,
            newRequest
        });
    }
}

export class ErrorChatResponseContentImpl implements ErrorChatResponseContent {
    readonly kind = 'error';
    protected _error: Error;
    constructor(error: Error) {
        this._error = error;
    }
    get error(): Error {
        return this._error;
    }
    asString(): string | undefined {
        return undefined;
    }
}

export class TextChatResponseContentImpl implements TextChatResponseContent {
    readonly kind = 'text';
    protected _content: string;

    constructor(content: string) {
        this._content = content;
    }

    get content(): string {
        return this._content;
    }

    asString(): string {
        return this._content;
    }

    asDisplayString(): string | undefined {
        return this.asString();
    }

    merge(nextChatResponseContent: TextChatResponseContent): boolean {
        this._content += nextChatResponseContent.content;
        return true;
    }
    toLanguageModelMessage(): TextMessage {
        return {
            actor: 'ai',
            type: 'text',
            text: this.content
        };
    }
}

export class ThinkingChatResponseContentImpl implements ThinkingChatResponseContent {
    readonly kind = 'thinking';
    protected _content: string;
    protected _signature: string;

    constructor(content: string, signature: string) {
        this._content = content;
        this._signature = signature;
    }

    get content(): string {
        return this._content;
    }
    get signature(): string {
        return this._signature;
    }

    asString(): string {
        return JSON.stringify({
            type: 'thinking',
            thinking: this.content,
            signature: this.signature
        });
    }

    asDisplayString(): string | undefined {
        return `<Thinking>${this.content}</Thinking>`;
    }

    merge(nextChatResponseContent: ThinkingChatResponseContent): boolean {
        this._content += nextChatResponseContent.content;
        this._signature += nextChatResponseContent.signature;
        return true;
    }

    toLanguageModelMessage(): ThinkingMessage {
        return {
            actor: 'ai',
            type: 'thinking',
            thinking: this.content,
            signature: this.signature
        };
    }
}

export class MarkdownChatResponseContentImpl implements MarkdownChatResponseContent {
    readonly kind = 'markdownContent';
    protected _content: MarkdownStringImpl = new MarkdownStringImpl();

    constructor(content: string) {
        this._content.appendMarkdown(content);
    }

    get content(): MarkdownString {
        return this._content;
    }

    asString(): string {
        return this._content.value;
    }

    asDisplayString(): string | undefined {
        return this.asString();
    }

    merge(nextChatResponseContent: MarkdownChatResponseContent): boolean {
        this._content.appendMarkdown(nextChatResponseContent.content.value);
        return true;
    }

    toLanguageModelMessage(): TextMessage {
        return {
            actor: 'ai',
            type: 'text',
            text: this.content.value
        };
    }
}

export class InformationalChatResponseContentImpl implements InformationalChatResponseContent {
    readonly kind = 'informational';
    protected _content: MarkdownStringImpl;

    constructor(content: string) {
        this._content = new MarkdownStringImpl(content);
    }

    get content(): MarkdownString {
        return this._content;
    }

    asString(): string | undefined {
        return undefined;
    }

    merge(nextChatResponseContent: InformationalChatResponseContent): boolean {
        this._content.appendMarkdown(nextChatResponseContent.content.value);
        return true;
    }
}

export class CodeChatResponseContentImpl implements CodeChatResponseContent {
    readonly kind = 'code';
    protected _code: string;
    protected _language?: string;
    protected _location?: Location;

    constructor(code: string, language?: string, location?: Location) {
        this._code = code;
        this._language = language;
        this._location = location;
    }

    get code(): string {
        return this._code;
    }

    get language(): string | undefined {
        return this._language;
    }

    get location(): Location | undefined {
        return this._location;
    }

    asString(): string {
        return `\`\`\`${this._language ?? ''}\n${this._code}\n\`\`\``;
    }

    merge(nextChatResponseContent: CodeChatResponseContent): boolean {
        this._code += `${nextChatResponseContent.code}`;
        return true;
    }
}

export class ToolCallChatResponseContentImpl implements ToolCallChatResponseContent {
    readonly kind = 'toolCall';
    protected _id?: string;
    protected _name?: string;
    protected _arguments?: string;
    protected _finished?: boolean;
    protected _result?: ToolCallResult;
    protected _confirmed: Promise<boolean>;
    protected _confirmationResolver?: (value: boolean) => void;
    protected _confirmationRejecter?: (reason?: unknown) => void;

    constructor(id?: string, name?: string, arg_string?: string, finished?: boolean, result?: ToolCallResult) {
        this._id = id;
        this._name = name;
        this._arguments = arg_string;
        this._finished = finished;
        this._result = result;
        // Initialize the confirmation promise immediately
        this._confirmed = this.createConfirmationPromise();
    }

    get id(): string | undefined {
        return this._id;
    }

    get name(): string | undefined {
        return this._name;
    }

    get arguments(): string | undefined {
        return this._arguments;
    }

    get finished(): boolean {
        return this._finished === undefined ? false : this._finished;
    }
    get result(): ToolCallResult | undefined {
        return this._result;
    }

    get confirmed(): Promise<boolean> {
        return this._confirmed;
    }

    /**
     * Create a confirmation promise that can be resolved/rejected later
     */
    createConfirmationPromise(): Promise<boolean> {
        // The promise is always created, just ensure we have resolution handlers
        if (!this._confirmationResolver) {
            this._confirmed = new Promise<boolean>((resolve, reject) => {
                this._confirmationResolver = resolve;
                this._confirmationRejecter = reject;
            });
        }
        return this._confirmed;
    }

    /**
     * Confirm the tool execution
     */
    confirm(): void {
        if (this._confirmationResolver) {
            this._confirmationResolver(true);
        }
    }

    /**
     * Deny the tool execution
     */
    deny(): void {
        if (this._confirmationResolver) {
            this._confirmationResolver(false);
            this._finished = true;
            this._result = 'Tool execution denied by user';
        }
    }

    /**
     * Cancel the confirmation (reject the promise)
     */
    cancelConfirmation(reason?: unknown): void {
        if (this._confirmationRejecter) {
            this._confirmationRejecter(reason);
        }
    }

    asString(): string {
        return '';
    }

    asDisplayString(): string {
        return `Tool call: ${this._name}(${this._arguments ?? ''})`;
    }

    merge(nextChatResponseContent: ToolCallChatResponseContent): boolean {
        if (nextChatResponseContent.id === this.id) {
            this._finished = nextChatResponseContent.finished;
            this._result = nextChatResponseContent.result;
            const args = nextChatResponseContent.arguments;
            this._arguments = (args && args.length > 0) ? args : this._arguments;
            // Don't merge confirmation promises - they should be managed separately
            return true;
        }
        if (nextChatResponseContent.name !== undefined) {
            return false;
        }
        if (nextChatResponseContent.arguments === undefined) {
            return false;
        }
        this._arguments += `${nextChatResponseContent.arguments}`;
        return true;
    }

    toLanguageModelMessage(): [ToolUseMessage, ToolResultMessage] {
        return [{
            actor: 'ai',
            type: 'tool_use',
            id: this.id ?? '',
            input: this.arguments && this.arguments.length !== 0 ? JSON.parse(this.arguments) : {},
            name: this.name ?? ''
        }, {
            actor: 'user',
            type: 'tool_result',
            tool_use_id: this.id ?? '',
            content: this.result,
            name: this.name ?? ''
        }];
    }
}

export const COMMAND_CHAT_RESPONSE_COMMAND: Command = {
    id: 'ai-chat.command-chat-response.generic'
};
export class CommandChatResponseContentImpl implements CommandChatResponseContent {
    readonly kind = 'command';

    constructor(public command?: Command, public customCallback?: CustomCallback, protected args?: unknown[]) { }

    get arguments(): unknown[] {
        return this.args ?? [];
    }

    asString(): string {
        return this.command?.id || this.customCallback?.label || 'command';
    }
}

export class HorizontalLayoutChatResponseContentImpl implements HorizontalLayoutChatResponseContent {
    readonly kind = 'horizontal';
    protected _content: ChatResponseContent[];

    constructor(content: ChatResponseContent[] = []) {
        this._content = content;
    }

    get content(): ChatResponseContent[] {
        return this._content;
    }

    asString(): string {
        return this._content.map(child => child.asString && child.asString()).join(' ');
    }

    asDisplayString(): string | undefined {
        return this.asString();
    }

    merge(nextChatResponseContent: ChatResponseContent): boolean {
        if (HorizontalLayoutChatResponseContent.is(nextChatResponseContent)) {
            this._content.push(...nextChatResponseContent.content);
        } else {
            this._content.push(nextChatResponseContent);
        }
        return true;
    }
}

/**
 * Default implementation for the QuestionResponseContent.
 */
export class QuestionResponseContentImpl implements QuestionResponseContent {
    readonly kind = 'question';
    protected _selectedOption: { text: string; value?: string } | undefined;
    constructor(public question: string, public options: { text: string, value?: string }[],
        public request: MutableChatRequestModel, public handler: QuestionResponseHandler) {
    }
    set selectedOption(option: { text: string; value?: string; } | undefined) {
        this._selectedOption = option;
        this.request.response.response.responseContentChanged();
    }
    get selectedOption(): { text: string; value?: string; } | undefined {
        return this._selectedOption;
    }
    asString?(): string | undefined {
        return `Question: ${this.question}
${this.selectedOption ? `Answer: ${this.selectedOption?.text}` : 'No answer'}`;
    }
    merge?(): boolean {
        return false;
    }
}

class ChatResponseImpl implements ChatResponse {
    protected readonly _onDidChangeEmitter = new Emitter<void>();
    onDidChange: Event<void> = this._onDidChangeEmitter.event;
    protected _content: ChatResponseContent[];
    protected _responseRepresentation: string;
    protected _responseRepresentationForDisplay: string;

    constructor() {
        // TODO accept serialized data as a parameter to restore a previously saved ChatResponse
        this._content = [];
    }

    get content(): ChatResponseContent[] {
        return this._content;
    }

    clearContent(): void {
        this._content = [];
        this._updateResponseRepresentation();
        this._onDidChangeEmitter.fire();
    }

    addContents(contents: ChatResponseContent[]): void {
        contents.forEach(c => this.doAddContent(c));
        this._onDidChangeEmitter.fire();
    }

    addContent(nextContent: ChatResponseContent): void {
        // TODO: Support more complex merges affecting different content than the last, e.g. via some kind of ProcessorRegistry
        // TODO: Support more of the built-in VS Code behavior, see
        //   https://github.com/microsoft/vscode/blob/a2cab7255c0df424027be05d58e1b7b941f4ea60/src/vs/workbench/contrib/chat/common/chatModel.ts#L188-L244
        this.doAddContent(nextContent);
        this._onDidChangeEmitter.fire();
    }

    protected doAddContent(nextContent: ChatResponseContent): void {
        if (ToolCallChatResponseContent.is(nextContent) && nextContent.id !== undefined) {
            const fittingTool = this._content.find(c => ToolCallChatResponseContent.is(c) && c.id === nextContent.id);
            if (fittingTool !== undefined) {
                fittingTool.merge?.(nextContent);
            } else {
                this._content.push(nextContent);
            }
        } else {
            const lastElement = this._content.length > 0
                ? this._content[this._content.length - 1]
                : undefined;
            if (lastElement?.kind === nextContent.kind && ChatResponseContent.hasMerge(lastElement)) {
                const mergeSuccess = lastElement.merge(nextContent);
                if (!mergeSuccess) {
                    this._content.push(nextContent);
                }
            } else {
                this._content.push(nextContent);
            }
        }
        this._updateResponseRepresentation();
    }

    responseContentChanged(): void {
        this._updateResponseRepresentation();
        this._onDidChangeEmitter.fire();
    }

    protected _updateResponseRepresentation(): void {
        this._responseRepresentation = this.responseRepresentationsToString(this._content, 'asString');
        this._responseRepresentationForDisplay = this.responseRepresentationsToString(this.content, 'asDisplayString');
    }

    protected responseRepresentationsToString(content: ChatResponseContent[], collect: 'asString' | 'asDisplayString'): string {
        return content
            .map(responseContent => {
                if (collect === 'asDisplayString') {
                    if (ChatResponseContent.hasDisplayString(responseContent)) {
                        return responseContent.asDisplayString();
                    }
                }
                if (ChatResponseContent.hasAsString(responseContent)) {
                    return responseContent.asString();
                }
                if (TextChatResponseContent.is(responseContent)) {
                    return responseContent.content;
                }
                console.warn(
                    'Was not able to map responseContent to a string',
                    responseContent
                );
                return undefined;
            })
            .filter(text => (text !== undefined && text !== ''))
            .join('\n\n');
    }

    asString(): string {
        return this._responseRepresentation;
    }

    asDisplayString(): string {
        return this._responseRepresentationForDisplay;
    }
}

export class MutableChatResponseModel implements ChatResponseModel {
    protected readonly _onDidChangeEmitter = new Emitter<void>();
    onDidChange: Event<void> = this._onDidChangeEmitter.event;

    data = {};

    protected _id: string;
    protected _requestId: string;
    protected _progressMessages: ChatProgressMessage[];
    protected _response: ChatResponseImpl;
    protected _isComplete: boolean;
    protected _isWaitingForInput: boolean;
    protected _agentId?: string;
    protected _isError: boolean;
    protected _errorObject: Error | undefined;
    protected _cancellationToken: CancellationTokenSource;

    constructor(requestId: string, agentId?: string) {
        // TODO accept serialized data as a parameter to restore a previously saved ChatResponseModel
        this._requestId = requestId;
        this._id = generateUuid();
        this._progressMessages = [];
        const response = new ChatResponseImpl();
        response.onDidChange(() => this._onDidChangeEmitter.fire());
        this._response = response;
        this._isComplete = false;
        this._isWaitingForInput = false;
        this._agentId = agentId;
        this._cancellationToken = new CancellationTokenSource();
    }

    get id(): string {
        return this._id;
    }

    get requestId(): string {
        return this._requestId;
    }

    get progressMessages(): ChatProgressMessage[] {
        return this._progressMessages;
    }

    addProgressMessage(message: { content: string } & Partial<Omit<ChatProgressMessage, 'kind'>>): ChatProgressMessage {
        const id = message.id ?? generateUuid();
        const existingMessage = this.getProgressMessage(id);
        if (existingMessage) {
            this.updateProgressMessage({ id, ...message });
            return existingMessage;
        }
        const newMessage: ChatProgressMessage = {
            kind: 'progressMessage',
            id,
            status: message.status ?? 'inProgress',
            show: message.show ?? 'untilFirstContent',
            ...message,
        };
        this._progressMessages.push(newMessage);
        this._onDidChangeEmitter.fire();
        return newMessage;
    }

    getProgressMessage(id: string): ChatProgressMessage | undefined {
        return this._progressMessages.find(message => message.id === id);
    }

    updateProgressMessage(message: { id: string } & Partial<Omit<ChatProgressMessage, 'kind'>>): void {
        const progressMessage = this.getProgressMessage(message.id);
        if (progressMessage) {
            Object.assign(progressMessage, message);
            this._onDidChangeEmitter.fire();
        }
    }

    get response(): ChatResponseImpl {
        return this._response;
    }

    get isComplete(): boolean {
        return this._isComplete;
    }

    get isCanceled(): boolean {
        return this._cancellationToken.token.isCancellationRequested;
    }

    get isWaitingForInput(): boolean {
        return this._isWaitingForInput;
    }

    get agentId(): string | undefined {
        return this._agentId;
    }

    overrideAgentId(agentId: string): void {
        this._agentId = agentId;
    }

    complete(): void {
        this._isComplete = true;
        this._isWaitingForInput = false;
        this._onDidChangeEmitter.fire();
    }

    cancel(): void {
        this._cancellationToken.cancel();
        this._isComplete = true;
        this._isWaitingForInput = false;
        this._onDidChangeEmitter.fire();
    }

    get cancellationToken(): CancellationToken {
        return this._cancellationToken.token;
    }

    waitForInput(): void {
        this._isWaitingForInput = true;
        this._onDidChangeEmitter.fire();
    }

    stopWaitingForInput(): void {
        this._isWaitingForInput = false;
        this._onDidChangeEmitter.fire();
    }

    error(error: Error): void {
        this._isComplete = true;
        this._isWaitingForInput = false;
        this._isError = true;
        this._errorObject = error;
        this._onDidChangeEmitter.fire();
    }
    get errorObject(): Error | undefined {
        return this._errorObject;
    }
    get isError(): boolean {
        return this._isError;
    }
}

export class ErrorChatResponseModel extends MutableChatResponseModel {
    constructor(requestId: string, error: Error, agentId?: string) {
        super(requestId, agentId);
        this.error(error);
    }
}

export class ProgressChatResponseContentImpl implements ProgressChatResponseContent {
    readonly kind = 'progress';
    protected _message: string;

    constructor(message: string) {
        this._message = message;
    }

    get message(): string {
        return this._message;
    }

    asString(): string {
        return JSON.stringify({
            type: 'progress',
            message: this.message
        });
    }

    asDisplayString(): string | undefined {
        return `<Progress>${this.message}</Progress>`;
    }

    merge(nextChatResponseContent: ProgressChatResponseContent): boolean {
        this._message = nextChatResponseContent.message;
        return true;
    }

    toLanguageModelMessage(): TextMessage {
        return {
            actor: 'ai',
            type: 'text',
            text: this.message
        };
    }
}
