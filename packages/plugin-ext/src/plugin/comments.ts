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

import * as theia from '@theia/plugin';
import { RPCProtocol } from '../common/rpc-protocol';
import { CommandRegistryImpl } from './command-registry';
import { UriComponents } from '../common/uri-components';
import { URI } from '@theia/core/shared/vscode-uri';
import {
    Range,
    Comment,
    CommentThreadCollapsibleState as CommentThreadCollapsibleStateModel,
    CommentOptions
} from '../common/plugin-api-rpc-model';
import { DocumentsExtImpl } from './documents';
import { Emitter } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { fromMarkdown, fromRange, toRange } from './type-converters';
import { CommentThreadCollapsibleState } from './types-impl';
import {
    CommentsCommandArg, CommentsContextCommandArg, CommentsEditCommandArg,
    CommentsExt,
    CommentsMain,
    CommentThreadChanges,
    Plugin as InternalPlugin,
    PLUGIN_RPC_CONTEXT
} from '../common/plugin-api-rpc';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.49.3/src/vs/workbench/api/common/extHostComments.ts

type ProviderHandle = number;

export class CommentsExtImpl implements CommentsExt {
    private handle = 0;
    private readonly proxy: CommentsMain;
    private readonly commentControllers: Map<ProviderHandle, CommentController> = new Map<ProviderHandle, CommentController>();
    private readonly commentControllersByExtension: Map<string, CommentController[]> = new Map<string, CommentController[]>();

    constructor(readonly rpc: RPCProtocol, readonly commands: CommandRegistryImpl, readonly _documents: DocumentsExtImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.COMMENTS_MAIN);

        commands.registerArgumentProcessor({
            processArgument: arg => {
                if (CommentsCommandArg.is(arg)) {
                    const commentController = this.commentControllers.get(arg.commentControlHandle);

                    if (!commentController) {
                        return arg;
                    }

                    const commentThread = commentController.getCommentThread(arg.commentThreadHandle);

                    if (!commentThread) {
                        return arg;
                    }

                    return {
                        thread: commentThread,
                        text: arg.text
                    };
                } else if (CommentsContextCommandArg.is(arg)) {
                    const commentController = this.commentControllers.get(arg.commentControlHandle);

                    if (!commentController) {
                        return arg;
                    }

                    const commentThread = commentController.getCommentThread(arg.commentThreadHandle);

                    if (!commentThread) {
                        return arg;
                    }

                    const comment = commentThread.getCommentByUniqueId(arg.commentUniqueId);

                    if (!comment) {
                        return arg;
                    }

                    return comment;
                } else if (CommentsEditCommandArg.is(arg)) {
                    const commentController = this.commentControllers.get(arg.commentControlHandle);

                    if (!commentController) {
                        return arg;
                    }

                    const commentThread = commentController.getCommentThread(arg.commentThreadHandle);

                    if (!commentThread) {
                        return arg;
                    }

                    const comment = commentThread.getCommentByUniqueId(arg.commentUniqueId);

                    if (!comment) {
                        return arg;
                    }

                    comment.body = arg.text;
                    return comment;
                }

                return arg;
            }
        });
    }

    createCommentController(plugin: InternalPlugin, id: string, label: string): theia.CommentController {
        const handle = this.handle++;
        const commentController = new CommentController(plugin.model.id, this.proxy, handle, id, label);
        this.commentControllers.set(commentController.handle, commentController);

        const commentControllers = this.commentControllersByExtension.get(plugin.model.id.toLowerCase()) || [];
        commentControllers.push(commentController);
        this.commentControllersByExtension.set(plugin.model.id.toLowerCase(), commentControllers);

        return commentController;
    }

    $createCommentThreadTemplate(commentControllerHandle: number, uriComponents: UriComponents, range: Range): void {
        const commentController = this.commentControllers.get(commentControllerHandle);

        if (!commentController) {
            return;
        }

        commentController.$createCommentThreadTemplate(uriComponents, range);
    }

    async $updateCommentThreadTemplate(commentControllerHandle: number, threadHandle: number, range: Range): Promise<void> {
        const commentController = this.commentControllers.get(commentControllerHandle);

        if (!commentController) {
            return;
        }

        commentController.$updateCommentThreadTemplate(threadHandle, range);
    }

    async $deleteCommentThread(commentControllerHandle: number, commentThreadHandle: number): Promise<void> {
        const commentController = this.commentControllers.get(commentControllerHandle);

        if (commentController) {
            commentController.$deleteCommentThread(commentThreadHandle);
        }
    }

    async $provideCommentingRanges(commentControllerHandle: number, uriComponents: UriComponents, token: theia.CancellationToken): Promise<Range[] | undefined> {
        const commentController = this.commentControllers.get(commentControllerHandle);

        if (!commentController || !commentController.commentingRangeProvider) {
            return Promise.resolve(undefined);
        }

        const documentData = this._documents.getDocumentData(URI.revive(uriComponents));
        if (documentData) {
            const ranges: theia.Range[] | undefined = await commentController.commentingRangeProvider!.provideCommentingRanges(documentData.document, token);
            if (ranges) {
                return ranges.map(x => fromRange(x));
            }
        }
    }
}

type CommentThreadModification = Partial<{
    range: theia.Range,
    label: string | undefined,
    contextValue: string | undefined,
    comments: theia.Comment[],
    collapsibleState: theia.CommentThreadCollapsibleState
}>;

export class ExtHostCommentThread implements theia.CommentThread, theia.Disposable {
    private static _handlePool: number = 0;
    readonly handle = ExtHostCommentThread._handlePool++;
    public commentHandle: number = 0;

    private modifications: CommentThreadModification = Object.create(null);

    set threadId(id: string) {
        this._id = id;
    }

    get threadId(): string {
        return this._id!;
    }

    get id(): string {
        return this._id!;
    }

    get resource(): theia.Uri {
        return this._uri;
    }

    get uri(): theia.Uri {
        return this._uri;
    }

    private readonly _onDidUpdateCommentThread = new Emitter<void>();
    readonly onDidUpdateCommentThread = this._onDidUpdateCommentThread.event;

    set range(range: theia.Range) {
        if (!range.isEqual(this._range)) {
            this._range = range;
            this.modifications.range = range;
            this._onDidUpdateCommentThread.fire();
        }
    }

    get range(): theia.Range {
        return this._range;
    }

    private _label: string | undefined;

    get label(): string | undefined {
        return this._label;
    }

    set label(label: string | undefined) {
        this._label = label;
        this.modifications.label = label;
        this._onDidUpdateCommentThread.fire();
    }

    private _contextValue: string | undefined;

    get contextValue(): string | undefined {
        return this._contextValue;
    }

    set contextValue(context: string | undefined) {
        this._contextValue = context;
        this.modifications.contextValue = context;
        this._onDidUpdateCommentThread.fire();
    }

    get comments(): theia.Comment[] {
        return this._comments;
    }

    set comments(newComments: theia.Comment[]) {
        this._comments = newComments;
        this.modifications.comments = newComments;
        this._onDidUpdateCommentThread.fire();
    }

    private collapseState?: theia.CommentThreadCollapsibleState;

    get collapsibleState(): theia.CommentThreadCollapsibleState {
        return this.collapseState!;
    }

    set collapsibleState(newState: theia.CommentThreadCollapsibleState) {
        this.collapseState = newState;
        this.modifications.collapsibleState = newState;
        this._onDidUpdateCommentThread.fire();
    }

    private localDisposables: Disposable[];

    private _isDisposed: boolean;

    public get isDisposed(): boolean {
        return this._isDisposed;
    }

    private commentsMap: Map<theia.Comment, number> = new Map<theia.Comment, number>();

    private acceptInputDisposables = new DisposableCollection();

    constructor(
        private proxy: CommentsMain,
        private commentController: CommentController,
        private _id: string | undefined,
        private _uri: theia.Uri,
        private _range: theia.Range,
        private _comments: theia.Comment[],
        extensionId: string
    ) {
        if (this._id === undefined) {
            this._id = `${commentController.id}.${this.handle}`;
        }

        this.proxy.$createCommentThread(
            this.commentController.handle,
            this.handle,
            this._id,
            this._uri,
            fromRange(this._range),
            extensionId
        );

        this.localDisposables = [];
        this._isDisposed = false;

        this.localDisposables.push(this.onDidUpdateCommentThread(() => {
            this.eventuallyUpdateCommentThread();
        }));

        // set up comments after ctor to batch update events.
        this.comments = _comments;
    }

    eventuallyUpdateCommentThread(): void {
        if (this._isDisposed) {
            return;
        }

        const modified = (value: keyof CommentThreadModification): boolean =>
            Object.prototype.hasOwnProperty.call(this.modifications, value);

        const formattedModifications: CommentThreadChanges = {};
        if (modified('range')) {
            formattedModifications.range = fromRange(this._range);
        }
        if (modified('label')) {
            formattedModifications.label = this.label;
        }
        if (modified('contextValue')) {
            formattedModifications.contextValue = this.contextValue;
        }
        if (modified('comments')) {
            formattedModifications.comments =
                this._comments.map(cmt => convertToModeComment(this, this.commentController, cmt, this.commentsMap));
        }
        if (modified('collapsibleState')) {
            formattedModifications.collapseState = convertToCollapsibleState(this.collapseState);
        }
        this.modifications = {};

        this.proxy.$updateCommentThread(
            this.commentController.handle,
            this.handle,
            this._id!,
            this._uri,
            formattedModifications
        );
    }

    getCommentByUniqueId(uniqueId: number): theia.Comment | undefined {
        for (const key of this.commentsMap) {
            const comment = key[0];
            const id = key[1];
            if (uniqueId === id) {
                return comment;
            }
        }

        return;
    }

    dispose(): void {
        this._isDisposed = true;
        this.acceptInputDisposables.dispose();
        this.localDisposables.forEach(disposable => disposable.dispose());
        this.proxy.$deleteCommentThread(
            this.commentController.handle,
            this.handle
        );
    }
}

class CommentController implements theia.CommentController {

    constructor(
        private extension: string,
        private proxy: CommentsMain,
        private _handle: number,
        private _id: string,
        private _label: string
    ) {
        this.proxy.$registerCommentController(this.handle, _id, _label);
    }

    private readonly threads: Map<number, ExtHostCommentThread> = new Map<number, ExtHostCommentThread>();
    readonly commentingRangeProvider?: theia.CommentingRangeProvider;

    get id(): string {
        return this._id;
    }

    get label(): string {
        return this._label;
    }

    get handle(): number {
        return this._handle;
    }

    private _options: CommentOptions | undefined;

    get options(): CommentOptions | undefined {
        return this._options;
    }

    set options(options: CommentOptions | undefined) {
        this._options = options;

        this.proxy.$updateCommentControllerFeatures(this.handle, { options: this._options });
    }

    createCommentThread(resource: theia.Uri, range: theia.Range, comments: theia.Comment[]): theia.CommentThread;
    createCommentThread(arg0: theia.Uri | string, arg1: theia.Uri | theia.Range, arg2: theia.Range | theia.Comment[], arg3?: theia.Comment[]): theia.CommentThread {
        if (typeof arg0 === 'string') {
            const commentThread = new ExtHostCommentThread(this.proxy, this, arg0, arg1 as theia.Uri, arg2 as theia.Range, arg3 as theia.Comment[], this.extension);
            this.threads.set(commentThread.handle, commentThread);
            return commentThread;
        } else {
            const commentThread = new ExtHostCommentThread(this.proxy, this, undefined, arg0 as theia.Uri, arg1 as theia.Range, arg2 as theia.Comment[], this.extension);
            this.threads.set(commentThread.handle, commentThread);
            return commentThread;
        }
    }

    $createCommentThreadTemplate(uriComponents: UriComponents, range: Range): ExtHostCommentThread {
        const commentThread = new ExtHostCommentThread(this.proxy, this, undefined, URI.revive(uriComponents), toRange(range), [], this.extension);
        commentThread.collapsibleState = CommentThreadCollapsibleStateModel.Expanded;
        this.threads.set(commentThread.handle, commentThread);
        return commentThread;
    }

    $updateCommentThreadTemplate(threadHandle: number, range: Range): void {
        const thread = this.threads.get(threadHandle);
        if (thread) {
            thread.range = toRange(range);
        }
    }

    $deleteCommentThread(threadHandle: number): void {
        const thread = this.threads.get(threadHandle);

        if (thread) {
            thread.dispose();
        }

        this.threads.delete(threadHandle);
    }

    getCommentThread(handle: number): ExtHostCommentThread | undefined {
        return this.threads.get(handle);
    }

    dispose(): void {
        this.threads.forEach(value => {
            value.dispose();
        });

        this.proxy.$unregisterCommentController(this.handle);
    }
}

function convertToModeComment(thread: ExtHostCommentThread, commentController: CommentController, theiaComment: theia.Comment, commentsMap: Map<theia.Comment, number>): Comment {
    let commentUniqueId = commentsMap.get(theiaComment)!;
    if (!commentUniqueId) {
        commentUniqueId = ++thread.commentHandle;
        commentsMap.set(theiaComment, commentUniqueId);
    }

    const iconPath = theiaComment.author && theiaComment.author.iconPath ? theiaComment.author.iconPath.toString() : undefined;

    return {
        mode: theiaComment.mode,
        contextValue: theiaComment.contextValue,
        uniqueIdInThread: commentUniqueId,
        body: fromMarkdown(theiaComment.body),
        userName: theiaComment.author.name,
        userIconPath: iconPath,
        label: theiaComment.label,
    };
}

function convertToCollapsibleState(kind: theia.CommentThreadCollapsibleState | undefined): CommentThreadCollapsibleStateModel {
    if (kind !== undefined) {
        switch (kind) {
            case CommentThreadCollapsibleState.Expanded:
                return CommentThreadCollapsibleStateModel.Expanded;
            case CommentThreadCollapsibleState.Collapsed:
                return CommentThreadCollapsibleStateModel.Collapsed;
        }
    }
    return CommentThreadCollapsibleStateModel.Collapsed;
}
