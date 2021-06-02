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

import { injectable } from '@theia/core/shared/inversify';
import { URI } from '@theia/core/shared/vscode-uri';
import { Event, Emitter } from '@theia/core/lib/common/event';
import {
    Range,
    CommentInfo,
    CommentingRanges,
    CommentThread,
    CommentThreadChangedEvent,
    CommentThreadChangedEventMain
} from '../../../common/plugin-api-rpc-model';
import { CommentController } from './comments-main';
import { CancellationToken } from '@theia/core/lib/common/cancellation';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.49.3/src/vs/workbench/contrib/comments/browser/commentService.ts

export interface ResourceCommentThreadEvent {
    resource: URI;
    commentInfos: CommentInfoMain[];
}

export interface CommentInfoMain extends CommentInfo {
    owner: string;
    label?: string;
}

export interface WorkspaceCommentThreadsEventMain {
    ownerId: string;
    commentThreads: CommentThread[];
}

export const CommentsService = Symbol('CommentsService');

export interface CommentsService {
    readonly onDidSetResourceCommentInfos: Event<ResourceCommentThreadEvent>;
    readonly onDidSetAllCommentThreads: Event<WorkspaceCommentThreadsEventMain>;
    readonly onDidUpdateCommentThreads: Event<CommentThreadChangedEventMain>;
    readonly onDidChangeActiveCommentThread: Event<CommentThread | null>;
    readonly onDidChangeActiveCommentingRange: Event<{ range: Range, commentingRangesInfo: CommentingRanges }>;
    readonly onDidSetDataProvider: Event<void>;
    readonly onDidDeleteDataProvider: Event<string>;

    setDocumentComments(resource: URI, commentInfos: CommentInfoMain[]): void;

    setWorkspaceComments(owner: string, commentsByResource: CommentThread[]): void;

    removeWorkspaceComments(owner: string): void;

    registerCommentController(owner: string, commentControl: CommentController): void;

    unregisterCommentController(owner: string): void;

    getCommentController(owner: string): CommentController | undefined;

    createCommentThreadTemplate(owner: string, resource: URI, range: Range): void;

    updateCommentThreadTemplate(owner: string, threadHandle: number, range: Range): Promise<void>;

    updateComments(ownerId: string, event: CommentThreadChangedEvent): void;

    disposeCommentThread(ownerId: string, threadId: string): void;

    getComments(resource: URI): Promise<(CommentInfoMain | null)[]>;

    getCommentingRanges(resource: URI): Promise<Range[]>;

    setActiveCommentThread(commentThread: CommentThread | null): void;
}

@injectable()
export class PluginCommentService implements CommentsService {

    private readonly onDidSetDataProviderEmitter: Emitter<void> = new Emitter<void>();
    readonly onDidSetDataProvider: Event<void> = this.onDidSetDataProviderEmitter.event;

    private readonly onDidDeleteDataProviderEmitter: Emitter<string> = new Emitter<string>();
    readonly onDidDeleteDataProvider: Event<string> = this.onDidDeleteDataProviderEmitter.event;

    private readonly onDidSetResourceCommentInfosEmitter: Emitter<ResourceCommentThreadEvent> = new Emitter<ResourceCommentThreadEvent>();
    readonly onDidSetResourceCommentInfos: Event<ResourceCommentThreadEvent> = this.onDidSetResourceCommentInfosEmitter.event;

    private readonly onDidSetAllCommentThreadsEmitter: Emitter<WorkspaceCommentThreadsEventMain> = new Emitter<WorkspaceCommentThreadsEventMain>();
    readonly onDidSetAllCommentThreads: Event<WorkspaceCommentThreadsEventMain> = this.onDidSetAllCommentThreadsEmitter.event;

    private readonly onDidUpdateCommentThreadsEmitter: Emitter<CommentThreadChangedEventMain> = new Emitter<CommentThreadChangedEventMain>();
    readonly onDidUpdateCommentThreads: Event<CommentThreadChangedEventMain> = this.onDidUpdateCommentThreadsEmitter.event;

    private readonly onDidChangeActiveCommentThreadEmitter = new Emitter<CommentThread | null>();
    readonly onDidChangeActiveCommentThread = this.onDidChangeActiveCommentThreadEmitter.event;

    private readonly onDidChangeActiveCommentingRangeEmitter = new Emitter<{ range: Range, commentingRangesInfo: CommentingRanges }>();
    readonly onDidChangeActiveCommentingRange: Event<{ range: Range, commentingRangesInfo: CommentingRanges }> = this.onDidChangeActiveCommentingRangeEmitter.event;

    private commentControls = new Map<string, CommentController>();

    setActiveCommentThread(commentThread: CommentThread | null): void {
        this.onDidChangeActiveCommentThreadEmitter.fire(commentThread);
    }

    setDocumentComments(resource: URI, commentInfos: CommentInfoMain[]): void {
        this.onDidSetResourceCommentInfosEmitter.fire({ resource, commentInfos });
    }

    setWorkspaceComments(owner: string, commentsByResource: CommentThread[]): void {
        this.onDidSetAllCommentThreadsEmitter.fire({ ownerId: owner, commentThreads: commentsByResource });
    }

    removeWorkspaceComments(owner: string): void {
        this.onDidSetAllCommentThreadsEmitter.fire({ ownerId: owner, commentThreads: [] });
    }

    registerCommentController(owner: string, commentControl: CommentController): void {
        this.commentControls.set(owner, commentControl);
        this.onDidSetDataProviderEmitter.fire();
    }

    unregisterCommentController(owner: string): void {
        this.commentControls.delete(owner);
        this.onDidDeleteDataProviderEmitter.fire(owner);
    }

    getCommentController(owner: string): CommentController | undefined {
        return this.commentControls.get(owner);
    }

    createCommentThreadTemplate(owner: string, resource: URI, range: Range): void {
        const commentController = this.commentControls.get(owner);

        if (!commentController) {
            return;
        }

        commentController.createCommentThreadTemplate(resource, range);
    }

    async updateCommentThreadTemplate(owner: string, threadHandle: number, range: Range): Promise<void> {
        const commentController = this.commentControls.get(owner);

        if (!commentController) {
            return;
        }

        await commentController.updateCommentThreadTemplate(threadHandle, range);
    }

    disposeCommentThread(owner: string, threadId: string): void {
        const controller = this.getCommentController(owner);
        if (controller) {
            controller.deleteCommentThreadMain(threadId);
        }
    }

    updateComments(ownerId: string, event: CommentThreadChangedEvent): void {
        const evt: CommentThreadChangedEventMain = Object.assign({}, event, { owner: ownerId });
        this.onDidUpdateCommentThreadsEmitter.fire(evt);
    }

    async getComments(resource: URI): Promise<(CommentInfoMain | null)[]> {
        const commentControlResult: Promise<CommentInfoMain | null>[] = [];

        this.commentControls.forEach(control => {
            commentControlResult.push(control.getDocumentComments(resource, CancellationToken.None)
                .catch(e => {
                    console.log(e);
                    return null;
                }));
        });

        return Promise.all(commentControlResult);
    }

    async getCommentingRanges(resource: URI): Promise<Range[]> {
        const commentControlResult: Promise<Range[]>[] = [];

        this.commentControls.forEach(control => {
            commentControlResult.push(control.getCommentingRanges(resource, CancellationToken.None));
        });

        const ret = await Promise.all(commentControlResult);
        return ret.reduce((prev, curr) => {
            prev.push(...curr);
            return prev;
        }, []);
    }
}
