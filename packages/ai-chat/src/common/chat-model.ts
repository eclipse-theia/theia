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

import { Command, Emitter, Event, generateUuid, URI } from '@theia/core';
import { Position } from '@theia/core/shared/vscode-languageserver-protocol';
import { MarkdownString, MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import { ParsedChatRequest } from './chat-parsed-request';
import { ChatAgentLocation } from './chat-agents';

/**********************
 * INTERFACES AND TYPE GUARDS
 **********************/

export type ChatChangeEvent =
    | ChatAddRequestEvent
    | ChatAddResponseEvent
    | ChatRemoveRequestEvent;

export interface ChatAddRequestEvent {
    kind: 'addRequest';
    request: ChatRequestModel;
}

export interface ChatAddResponseEvent {
    kind: 'addResponse';
    response: ChatResponseModel;
}

export type ChatRequestRemovalReason = 'removal' | 'resend' | 'adoption';

export interface ChatRemoveRequestEvent {
    kind: 'removeRequest';
    requestId: string;
    responseId?: string;
    reason: ChatRequestRemovalReason;
}

export interface ChatModel {
    readonly onDidChange: Event<ChatChangeEvent>;
    readonly id: string;
    readonly location: ChatAgentLocation;
    getRequests(): ChatRequestModel[];
    addRequest(parsedChatRequest: ParsedChatRequest, agentId?: string): ChatRequestModel;
    isEmpty(): boolean;
}

export interface ChatRequest {
    readonly text: string;
    readonly displayText?: string;
}

export interface ChatRequestModel {
    readonly id: string;
    readonly session: ChatModel;
    readonly request: ChatRequest;
    readonly response: ChatResponseModel;
    readonly message: ParsedChatRequest;
    readonly agentId?: string;
}

export interface ChatProgressMessage {
    kind: 'progressMessage';
    content: string;
}

export interface BaseChatResponseContent {
    kind: string;
    asString?(): string;
    merge?(nextChatResponseContent: BaseChatResponseContent): boolean;
}

export const isBaseChatResponseContent = (
    obj: unknown
): obj is BaseChatResponseContent =>
    !!(
        obj &&
        typeof obj === 'object' &&
        'kind' in obj &&
        typeof (obj as { kind: unknown }).kind === 'string'
    );

export const hasAsString = (
    obj: BaseChatResponseContent
): obj is Required<Pick<BaseChatResponseContent, 'asString'>> &
BaseChatResponseContent => obj.asString !== undefined;

export const hasMerge = (
    obj: BaseChatResponseContent
): obj is Required<Pick<BaseChatResponseContent, 'merge'>> &
BaseChatResponseContent => obj.merge !== undefined;

export interface TextChatResponseContent
    extends Required<BaseChatResponseContent> {
    kind: 'text';
    content: string;
}

export interface MarkdownChatResponseContent
    extends Required<BaseChatResponseContent> {
    kind: 'markdownContent';
    content: MarkdownString;
}

export interface CodeChatResponseContent
    extends BaseChatResponseContent {
    kind: 'code';
    code: string;
    language?: string;
    location?: Location;
}

export interface HorizontalLayoutChatResponseContent extends Required<BaseChatResponseContent> {
    kind: 'horizontal';
    content: BaseChatResponseContent[];
}

export interface ToolCallResponseContent extends Required<BaseChatResponseContent> {
    kind: 'toolCall';
    id?: string;
    name?: string;
    arguments?: string;
    finished: boolean;
    result?: string;
}

export interface Location {
    uri: URI;
    position: Position;
}
export function isLocation(obj: unknown): obj is Location {
    return !!obj && typeof obj === 'object' &&
        'uri' in obj && (obj as { uri: unknown }).uri instanceof URI &&
        'position' in obj && Position.is((obj as { position: unknown }).position);
}

export interface CommandChatResponseContent extends BaseChatResponseContent {
    kind: 'command';
    command: Command;
    commandHandler?: (...commandArgs: unknown[]) => Promise<void>;
    arguments?: unknown[];
}

export const isTextChatResponseContent = (
    obj: unknown
): obj is TextChatResponseContent =>
    isBaseChatResponseContent(obj) &&
    obj.kind === 'text' &&
    'content' in obj &&
    typeof (obj as { content: unknown }).content === 'string';

export const isMarkdownChatResponseContent = (
    obj: unknown
): obj is MarkdownChatResponseContent =>
    isBaseChatResponseContent(obj) &&
    obj.kind === 'markdownContent' &&
    'content' in obj &&
    MarkdownString.is((obj as { content: unknown }).content);

export const isCommandChatResponseContent = (
    obj: unknown
): obj is CommandChatResponseContent =>
    isBaseChatResponseContent(obj) &&
    obj.kind === 'command' &&
    'command' in obj &&
    Command.is((obj as { command: unknown }).command);

export const isCodeChatResponseContent = (
    obj: unknown
): obj is CodeChatResponseContent =>
    isBaseChatResponseContent(obj) &&
    obj.kind === 'code' &&
    'code' in obj &&
    typeof (obj as { code: unknown }).code === 'string';

export const isHorizontalLayoutChatResponseContent = (obj: unknown): obj is HorizontalLayoutChatResponseContent =>
    isBaseChatResponseContent(obj) &&
    obj.kind === 'horizontal' &&
    'content' in obj &&
    Array.isArray((obj as { content: unknown }).content) &&
    (obj as { content: unknown[] }).content.every(isBaseChatResponseContent);

export const isToolCallChatResponseContent = (
    obj: unknown
): obj is ToolCallResponseContent =>
    isBaseChatResponseContent(obj) &&
    obj.kind === 'toolCall';

export type ChatResponseContent =
    | BaseChatResponseContent
    | TextChatResponseContent
    | MarkdownChatResponseContent
    | CommandChatResponseContent
    | CodeChatResponseContent
    | HorizontalLayoutChatResponseContent
    | ToolCallResponseContent;

export interface ChatResponse {
    readonly content: ChatResponseContent[];
    asString(): string;
}

export interface ChatResponseModel {
    readonly onDidChange: Event<void>;
    readonly id: string;
    readonly requestId: string;
    readonly progressMessages: ChatProgressMessage[];
    readonly response: ChatResponse;
    readonly isComplete: boolean;
    readonly isCanceled: boolean;
    readonly agentId?: string;
    cancel(): void;
}

/**********************
 * Implementations
 **********************/

export class ChatModelImpl implements ChatModel {
    protected readonly _onDidChangeEmitter = new Emitter<ChatChangeEvent>();
    onDidChange: Event<ChatChangeEvent> = this._onDidChangeEmitter.event;

    protected _requests: ChatRequestModelImpl[];
    protected _id: string;

    constructor(public readonly location = ChatAgentLocation.Panel) {
        // TODO accept serialized data as a parameter to restore a previously saved ChatModel
        this._requests = [];
        this._id = generateUuid();
    }

    getRequests(): ChatRequestModelImpl[] {
        return this._requests;
    }

    get id(): string {
        return this._id;
    }

    addRequest(parsedChatRequest: ParsedChatRequest, agentId?: string): ChatRequestModelImpl {
        const requestModel = new ChatRequestModelImpl(this, parsedChatRequest, agentId);
        this._requests.push(requestModel);
        this._onDidChangeEmitter.fire({
            kind: 'addRequest',
            request: requestModel,
        });
        return requestModel;
    }

    isEmpty(): boolean {
        return this._requests.length === 0;
    }
}

export class ChatRequestModelImpl implements ChatRequestModel {
    protected _id: string;
    protected _session: ChatModel;
    protected _request: ChatRequest;
    protected _response: ChatResponseModelImpl;
    protected _agentId?: string;

    constructor(session: ChatModel, public readonly message: ParsedChatRequest, agentId?: string) {
        // TODO accept serialized data as a parameter to restore a previously saved ChatRequestModel
        this._request = message.request;
        this._id = generateUuid();
        this._session = session;
        this._response = new ChatResponseModelImpl(this._id, agentId);
        this._agentId = agentId;
    }

    get id(): string {
        return this._id;
    }

    get session(): ChatModel {
        return this._session;
    }

    get request(): ChatRequest {
        return this._request;
    }

    get response(): ChatResponseModelImpl {
        return this._response;
    }

    get agentId(): string | undefined {
        return this._agentId;
    }

}

export class TextChatResponseContentImpl implements TextChatResponseContent {
    kind: 'text' = 'text';
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

    merge(nextChatResponseContent: TextChatResponseContent): boolean {
        this._content += nextChatResponseContent.content;
        return true;
    }
}

export class MarkdownChatResponseContentImpl implements MarkdownChatResponseContent {
    kind: 'markdownContent' = 'markdownContent';
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

    merge(nextChatResponseContent: MarkdownChatResponseContent): boolean {
        this._content.appendMarkdown(nextChatResponseContent.content.value);
        return true;
    }
}

export class CodeChatResponseContentImpl implements CodeChatResponseContent {
    kind: 'code' = 'code';
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

export class ToolCallResponseContentImpl implements ToolCallResponseContent {
    kind: 'toolCall' = 'toolCall';
    protected _id?: string;
    protected _name?: string;
    protected _arguments?: string;
    protected _finished?: boolean;
    protected _result?: string;

    constructor(id?: string, name?: string, arg_string?: string, finished?: boolean, result?: string) {
        this._id = id;
        this._name = name;
        this._arguments = arg_string;
        this._finished = finished;
        this._result = result;
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
    get result(): string | undefined {
        return this._result;
    }

    asString(): string {
        return `Tool call: ${this._name}(${this._arguments ?? ''})`;
    }
    merge(nextChatResponseContent: ToolCallResponseContent): boolean {
        if (nextChatResponseContent.id === this.id) {
            this._finished = nextChatResponseContent.finished;
            this._result = nextChatResponseContent.result;
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
}

export const COMMAND_CHAT_RESPONSE_COMMAND: Command = {
    id: 'ai-chat.command-chat-response.generic'
};
export class CommandChatResponseContentImpl implements CommandChatResponseContent {
    kind: 'command' = 'command';

    arguments: unknown[] | undefined;

    protected _command: Command;
    protected _commandHandler?: (...commandArgs: unknown[]) => Promise<void>;

    constructor(command: Command = COMMAND_CHAT_RESPONSE_COMMAND, args?: unknown[], commandHandler?: (...commandArgs: unknown[]) => Promise<void>) {
        this._command = command;
        this.arguments = args;
        this._commandHandler = commandHandler;
    }

    get command(): Command {
        return this._command;
    }

    get commandHandler(): ((...commandArgs: unknown[]) => Promise<void>) | undefined {
        return this._commandHandler;
    }

    asString(): string {
        return this._command.id;
    }
}

export class HorizontalLayoutChatResponseContentImpl implements HorizontalLayoutChatResponseContent {
    kind: 'horizontal' = 'horizontal';
    protected _content: BaseChatResponseContent[];

    constructor(content: BaseChatResponseContent[] = []) {
        this._content = content;
    }

    get content(): BaseChatResponseContent[] {
        return this._content;
    }

    asString(): string {
        return this._content.map(child => child.asString && child.asString()).join(' ');
    }

    merge(nextChatResponseContent: BaseChatResponseContent): boolean {
        if (isHorizontalLayoutChatResponseContent(nextChatResponseContent)) {
            this._content.push(...nextChatResponseContent.content);
        } else {
            this._content.push(nextChatResponseContent);
        }
        return true;
    }
}

class ChatResponseImpl implements ChatResponse {
    protected readonly _onDidChangeEmitter = new Emitter<void>();
    onDidChange: Event<void> = this._onDidChangeEmitter.event;
    protected _content: ChatResponseContent[];
    protected _responseRepresentation: string;

    constructor() {
        // TODO accept serialized data as a parameter to restore a previously saved ChatResponse
        this._content = [];
    }

    get content(): ChatResponseContent[] {
        return this._content;
    }

    addContent(nextContent: ChatResponseContent): void {
        // TODO: Support more complex merges affecting different content than the last, e.g. via some kind of ProcessorRegistry
        // TODO: Support more of the built-in VS Code behavior, see
        //   https://github.com/microsoft/vscode/blob/a2cab7255c0df424027be05d58e1b7b941f4ea60/src/vs/workbench/contrib/chat/common/chatModel.ts#L188-L244
        if (isToolCallChatResponseContent(nextContent) && nextContent.id !== undefined) {
            const fittingTool = this._content.find(c => isToolCallChatResponseContent(c) && c.id === nextContent.id);
            if (fittingTool !== undefined) {
                fittingTool.merge?.(nextContent);
            } else {
                this._content.push(nextContent);
            }
        } else {
            const lastElement =
                this._content.length > 0
                    ? this._content[this._content.length - 1]
                    : undefined;
            if (lastElement?.kind === nextContent.kind && hasMerge(lastElement)) {
                const mergeSuccess = lastElement.merge(nextContent);
                if (!mergeSuccess) {
                    this._content.push(nextContent);
                }
            } else {
                this._content.push(nextContent);
            }
        }
        this._updateResponseRepresentation();
        this._onDidChangeEmitter.fire();
    }

    protected _updateResponseRepresentation(): void {
        this._responseRepresentation = this._content
            .map(responseContent => {
                if (hasAsString(responseContent)) {
                    return responseContent.asString();
                }
                if (isTextChatResponseContent(responseContent)) {
                    return responseContent.content;
                }
                console.warn(
                    'Was not able to map responseContent to a string',
                    responseContent
                );
                return undefined;
            })
            .filter(text => text !== undefined)
            .join('\n\n');
    }

    asString(): string {
        return this._responseRepresentation;
    }
}

class ChatResponseModelImpl implements ChatResponseModel {
    protected readonly _onDidChangeEmitter = new Emitter<void>();
    onDidChange: Event<void> = this._onDidChangeEmitter.event;

    protected _id: string;
    protected _requestId: string;
    protected _progressMessages: ChatProgressMessage[];
    protected _response: ChatResponseImpl;
    protected _isComplete: boolean;
    protected _isCanceled: boolean;
    protected _agentId?: string;

    constructor(requestId: string, agentId?: string) {
        // TODO accept serialized data as a parameter to restore a previously saved ChatResponseModel
        this._requestId = requestId;
        this._id = generateUuid();
        this._progressMessages = [];
        const response = new ChatResponseImpl();
        response.onDidChange(() => this._onDidChangeEmitter.fire());
        this._response = response;
        this._isComplete = false;
        this._isCanceled = false;
        this._agentId = agentId;
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

    get response(): ChatResponseImpl {
        return this._response;
    }

    get isComplete(): boolean {
        return this._isComplete;
    }

    get isCanceled(): boolean {
        return this._isCanceled;
    }

    get agentId(): string | undefined {
        return this._agentId;
    }

    complete(): void {
        this._isComplete = true;
        this._onDidChangeEmitter.fire();
    }

    cancel(): void {
        this._isComplete = true;
        this._isCanceled = true;
        this._onDidChangeEmitter.fire();
    }
}
