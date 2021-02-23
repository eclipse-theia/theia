/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import {
    Range,
    Comment,
    CommentInput,
    CommentOptions,
    CommentThread,
    CommentThreadChangedEvent
} from '../../../common/plugin-api-rpc-model';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { CommentThreadCollapsibleState } from '../../../plugin/types-impl';
import {
    CommentProviderFeatures,
    CommentsExt,
    CommentsMain,
    CommentThreadChanges,
    MAIN_RPC_CONTEXT
} from '../../../common/plugin-api-rpc';
import { Disposable } from '@theia/core/lib/common/disposable';
import { CommentsService, CommentInfoMain } from './comments-service';
import { UriComponents } from '../../../common/uri-components';
import { URI } from '@theia/core/shared/vscode-uri';
import { CancellationToken } from '@theia/core/lib/common';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { interfaces } from '@theia/core/shared/inversify';
import { v4 as uuidv4 } from 'uuid';
import { CommentsContribution } from './comments-contribution';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.49.3/src/vs/workbench/api/browser/mainThreadComments.ts

export class CommentThreadImpl implements CommentThread, Disposable {
    private _input?: CommentInput;
    get input(): CommentInput | undefined {
        return this._input;
    }

    set input(value: CommentInput | undefined) {
        this._input = value;
        this.onDidChangeInputEmitter.fire(value);
    }

    private readonly onDidChangeInputEmitter = new Emitter<CommentInput | undefined>();
    get onDidChangeInput(): Event<CommentInput | undefined> { return this.onDidChangeInputEmitter.event; }

    private _label: string | undefined;

    get label(): string | undefined {
        return this._label;
    }

    set label(label: string | undefined) {
        this._label = label;
        this.onDidChangeLabelEmitter.fire(this._label);
    }

    private readonly onDidChangeLabelEmitter = new Emitter<string | undefined>();
    readonly onDidChangeLabel: Event<string | undefined> = this.onDidChangeLabelEmitter.event;

    private _contextValue: string | undefined;

    get contextValue(): string | undefined {
        return this._contextValue;
    }

    set contextValue(context: string | undefined) {
        this._contextValue = context;
    }

    private _comments: Comment[] | undefined;

    public get comments(): Comment[] | undefined {
        return this._comments;
    }

    public set comments(newComments: Comment[] | undefined) {
        this._comments = newComments;
        this.onDidChangeCommentsEmitter.fire(this._comments);
    }

    private readonly onDidChangeCommentsEmitter = new Emitter<Comment[] | undefined>();
    get onDidChangeComments(): Event<Comment[] | undefined> { return this.onDidChangeCommentsEmitter.event; }

    set range(range: Range) {
        this._range = range;
        this.onDidChangeRangeEmitter.fire(this._range);
    }

    get range(): Range {
        return this._range;
    }

    private readonly onDidChangeRangeEmitter = new Emitter<Range>();
    public onDidChangeRange = this.onDidChangeRangeEmitter.event;

    private _collapsibleState: CommentThreadCollapsibleState | undefined;
    get collapsibleState(): CommentThreadCollapsibleState | undefined {
        return this._collapsibleState;
    }

    set collapsibleState(newState: CommentThreadCollapsibleState | undefined) {
        this._collapsibleState = newState;
        this.onDidChangeCollapsibleStateEmitter.fire(this._collapsibleState);
    }

    private readonly onDidChangeCollapsibleStateEmitter = new Emitter<CommentThreadCollapsibleState | undefined>();
    readonly onDidChangeCollapsibleState = this.onDidChangeCollapsibleStateEmitter.event;

    private _isDisposed: boolean;

    get isDisposed(): boolean {
        return this._isDisposed;
    }

    constructor(
        public commentThreadHandle: number,
        public controllerHandle: number,
        public extensionId: string,
        public threadId: string,
        public resource: string,
        private _range: Range
    ) {
        this._isDisposed = false;
    }

    batchUpdate(changes: CommentThreadChanges): void {
        const modified = (value: keyof CommentThreadChanges): boolean =>
            Object.prototype.hasOwnProperty.call(changes, value);

        if (modified('range')) { this._range = changes.range!; }
        if (modified('label')) { this._label = changes.label; }
        if (modified('contextValue')) { this._contextValue = changes.contextValue; }
        if (modified('comments')) { this._comments = changes.comments; }
        if (modified('collapseState')) { this._collapsibleState = changes.collapseState; }
    }

    dispose(): void {
        this._isDisposed = true;
        this.onDidChangeCollapsibleStateEmitter.dispose();
        this.onDidChangeCommentsEmitter.dispose();
        this.onDidChangeInputEmitter.dispose();
        this.onDidChangeLabelEmitter.dispose();
        this.onDidChangeRangeEmitter.dispose();
    }
}

export class CommentController {
    get handle(): number {
        return this._handle;
    }

    get id(): string {
        return this._id;
    }

    get contextValue(): string {
        return this._id;
    }

    get proxy(): CommentsExt {
        return this._proxy;
    }

    get label(): string {
        return this._label;
    }

    get options(): CommentOptions | undefined {
        return this._features.options;
    }

    private readonly threads: Map<number, CommentThreadImpl> = new Map<number, CommentThreadImpl>();
    public activeCommentThread?: CommentThread;

    get features(): CommentProviderFeatures {
        return this._features;
    }

    constructor(
        private readonly _proxy: CommentsExt,
        private readonly _commentService: CommentsService,
        private readonly _handle: number,
        private readonly _uniqueId: string,
        private readonly _id: string,
        private readonly _label: string,
        private _features: CommentProviderFeatures
    ) { }

    updateFeatures(features: CommentProviderFeatures): void {
        this._features = features;
    }

    createCommentThread(extensionId: string,
        commentThreadHandle: number,
        threadId: string,
        resource: UriComponents,
        range: Range,
    ): CommentThread {
        const thread = new CommentThreadImpl(
            commentThreadHandle,
            this.handle,
            extensionId,
            threadId,
            URI.revive(resource).toString(),
            range
        );

        this.threads.set(commentThreadHandle, thread);

        this._commentService.updateComments(this._uniqueId, {
            added: [thread],
            removed: [],
            changed: []
        });

        return thread;
    }

    updateCommentThread(commentThreadHandle: number,
        threadId: string,
        resource: UriComponents,
        changes: CommentThreadChanges): void {
        const thread = this.getKnownThread(commentThreadHandle);
        thread.batchUpdate(changes);

        this._commentService.updateComments(this._uniqueId, {
            added: [],
            removed: [],
            changed: [thread]
        });
    }

    deleteCommentThread(commentThreadHandle: number): void {
        const thread = this.getKnownThread(commentThreadHandle);
        this.threads.delete(commentThreadHandle);

        this._commentService.updateComments(this._uniqueId, {
            added: [],
            removed: [thread],
            changed: []
        });

        thread.dispose();
    }

    deleteCommentThreadMain(commentThreadId: string): void {
        this.threads.forEach(thread => {
            if (thread.threadId === commentThreadId) {
                this._proxy.$deleteCommentThread(this._handle, thread.commentThreadHandle);
            }
        });
    }

    updateInput(input: string): void {
        const thread = this.activeCommentThread;

        if (thread && thread.input) {
            const commentInput = thread.input;
            commentInput.value = input;
            thread.input = commentInput;
        }
    }

    private getKnownThread(commentThreadHandle: number): CommentThreadImpl {
        const thread = this.threads.get(commentThreadHandle);
        if (!thread) {
            throw new Error('unknown thread');
        }
        return thread;
    }

    async getDocumentComments(resource: URI, token: CancellationToken): Promise<CommentInfoMain> {
        const ret: CommentThread[] = [];
        for (const thread of [...this.threads.keys()]) {
            const commentThread = this.threads.get(thread)!;
            if (commentThread.resource === resource.toString()) {
                ret.push(commentThread);
            }
        }

        const commentingRanges = await this._proxy.$provideCommentingRanges(this.handle, resource, token);

        return <CommentInfoMain>{
            owner: this._uniqueId,
            label: this.label,
            threads: ret,
            commentingRanges: {
                resource: resource,
                ranges: commentingRanges || []
            }
        };
    }

    async getCommentingRanges(resource: URI, token: CancellationToken): Promise<Range[]> {
        const commentingRanges = await this._proxy.$provideCommentingRanges(this.handle, resource, token);
        return commentingRanges || [];
    }

    getAllComments(): CommentThread[] {
        const ret: CommentThread[] = [];
        for (const thread of [...this.threads.keys()]) {
            ret.push(this.threads.get(thread)!);
        }

        return ret;
    }

    createCommentThreadTemplate(resource: UriComponents, range: Range): void {
        this._proxy.$createCommentThreadTemplate(this.handle, resource, range);
    }

    async updateCommentThreadTemplate(threadHandle: number, range: Range): Promise<void> {
        await this._proxy.$updateCommentThreadTemplate(this.handle, threadHandle, range);
    }
}

export class CommentsMainImp implements CommentsMain {
    private readonly proxy: CommentsExt;
    private documentProviders = new Map<number, Disposable>();
    private workspaceProviders = new Map<number, Disposable>();
    private handlers = new Map<number, string>();
    private commentControllers = new Map<number, CommentController>();

    private activeCommentThread?: CommentThread;
    private readonly commentService: CommentsService;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.COMMENTS_EXT);
        container.get(CommentsContribution);
        this.commentService = container.get(CommentsService);
        this.commentService.onDidChangeActiveCommentThread(async thread => {
            const handle = (thread as CommentThread).controllerHandle;
            const controller = this.commentControllers.get(handle);

            if (!controller) {
                return;
            }

            this.activeCommentThread = thread as CommentThread;
            controller.activeCommentThread = this.activeCommentThread;
        });
    }

    $registerCommentController(handle: number, id: string, label: string): void {
        const providerId = uuidv4();
        this.handlers.set(handle, providerId);

        const provider = new CommentController(this.proxy, this.commentService, handle, providerId, id, label, {});
        this.commentService.registerCommentController(providerId, provider);
        this.commentControllers.set(handle, provider);
        this.commentService.setWorkspaceComments(String(handle), []);
    }

    $unregisterCommentController(handle: number): void {
        const providerId = this.handlers.get(handle);
        if (typeof providerId !== 'string') {
            throw new Error('unknown handler');
        }
        this.commentService.unregisterCommentController(providerId);
        this.handlers.delete(handle);
        this.commentControllers.delete(handle);
    }

    $updateCommentControllerFeatures(handle: number, features: CommentProviderFeatures): void {
        const provider = this.commentControllers.get(handle);

        if (!provider) {
            return undefined;
        }

        provider.updateFeatures(features);
    }

    $createCommentThread(handle: number,
        commentThreadHandle: number,
        threadId: string,
        resource: UriComponents,
        range: Range,
        extensionId: string
    ): CommentThread | undefined {
        const provider = this.commentControllers.get(handle);

        if (!provider) {
            return undefined;
        }

        return provider.createCommentThread(extensionId, commentThreadHandle, threadId, resource, range);
    }

    $updateCommentThread(handle: number,
        commentThreadHandle: number,
        threadId: string,
        resource: UriComponents,
        changes: CommentThreadChanges): void {
        const provider = this.commentControllers.get(handle);

        if (!provider) {
            return undefined;
        }

        return provider.updateCommentThread(commentThreadHandle, threadId, resource, changes);
    }

    $deleteCommentThread(handle: number, commentThreadHandle: number): void {
        const provider = this.commentControllers.get(handle);

        if (!provider) {
            return;
        }

        return provider.deleteCommentThread(commentThreadHandle);
    }

    private getHandler(handle: number): string {
        if (!this.handlers.has(handle)) {
            throw new Error('Unknown handler');
        }
        return this.handlers.get(handle)!;
    }

    $onDidCommentThreadsChange(handle: number, event: CommentThreadChangedEvent): void {
        const providerId = this.getHandler(handle);
        this.commentService.updateComments(providerId, event);
    }

    dispose(): void {
        this.workspaceProviders.forEach(value => value.dispose());
        this.workspaceProviders.clear();
        this.documentProviders.forEach(value => value.dispose());
        this.documentProviders.clear();
    }
}
