// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import { AIChatInputWidget, type AIChatInputConfiguration } from '../chat-input-widget';
import type { EditableRequestNode } from './chat-view-tree-widget';
import { URI } from '@theia/core';
import { CHAT_VIEW_LANGUAGE_EXTENSION } from '../chat-view-language-contribution';
import type { ChatRequestModel, EditableChatRequestModel, ChatHierarchyBranch } from '@theia/ai-chat';
import type { AIVariableResolutionRequest } from '@theia/ai-core';
import { Key } from '@theia/core/lib/browser';

export const AIChatTreeInputConfiguration = Symbol('AIChatTreeInputConfiguration');
export interface AIChatTreeInputConfiguration extends AIChatInputConfiguration { }

export const AIChatTreeInputArgs = Symbol('AIChatTreeInputArgs');
export interface AIChatTreeInputArgs {
    node: EditableRequestNode;
    /**
     * The branch of the chat tree for this request node (used by the input widget for state tracking).
     */
    branch?: ChatHierarchyBranch;
    initialValue?: string;
    onQuery: (query: string) => Promise<void>;
    onUnpin?: () => void;
    onCancel?: (requestModel: ChatRequestModel) => void;
    onDeleteChangeSet?: (requestModel: ChatRequestModel) => void;
    onDeleteChangeSetElement?: (requestModel: ChatRequestModel, index: number) => void;
}
export const AIChatTreeInputFactory = Symbol('AIChatTreeInputFactory');
export type AIChatTreeInputFactory = (args: AIChatTreeInputArgs) => AIChatTreeInputWidget;

@injectable()
export class AIChatTreeInputWidget extends AIChatInputWidget {
    public static override ID = 'chat-tree-input-widget';

    @inject(AIChatTreeInputArgs)
    protected readonly args: AIChatTreeInputArgs;

    @inject(AIChatTreeInputConfiguration) @optional()
    protected override readonly configuration: AIChatTreeInputConfiguration | undefined;

    get requestNode(): EditableRequestNode {
        return this.args.node;
    }

    get request(): EditableChatRequestModel {
        return this.requestNode.request;
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.updateBranch();

        const request = this.requestNode.request;
        this.toDispose.push(request.session.onDidChange(() => {
            this.updateBranch();
        }));

        this.addKeyListener(this.node, Key.ESCAPE, () => {
            this.request.cancelEdit();
        });

        this.editorReady.promise.then(() => {
            if (this.editorRef) {
                this.editorRef.focus();
            }
        });
    }

    protected updateBranch(): void {
        this.branch = this.args.branch ?? this.requestNode.branch;
    }

    protected override getResourceUri(): URI {
        return new URI(`ai-chat:/${this.requestNode.id}-input.${CHAT_VIEW_LANGUAGE_EXTENSION}`);
    }

    override addContext(variable: AIVariableResolutionRequest): void {
        this.request.editContextManager.addVariables(variable);
    }

    protected override getContext(): readonly AIVariableResolutionRequest[] {
        return this.request.editContextManager.getVariables();
    }

    protected override deleteContextElement(index: number): void {
        this.request.editContextManager.deleteVariables(index);
    }
}
