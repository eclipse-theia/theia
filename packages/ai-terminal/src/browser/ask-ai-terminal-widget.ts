// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { ChatAgentLocation, ChatRequest } from '@theia/ai-chat';
import { AskAIInputBaseArgs, AskAIInputWidgetBase } from '@theia/ai-chat-ui/lib/browser/ask-ai-input-widget-base';
import { AIChatInputConfiguration } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { Disposable, DisposableCollection } from '@theia/core';
import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { TerminalWidgetImpl } from '@theia/terminal/lib/browser/terminal-widget-impl';

export const AskAITerminalInputConfiguration = Symbol('AskAITerminalInputConfiguration');
export interface AskAITerminalInputConfiguration extends AIChatInputConfiguration { }

export const AskAITerminalInputArgs = Symbol('AskAITerminalInputArgs');
export interface AskAITerminalInputArgs extends AskAIInputBaseArgs { }

export const AskAITerminalInputFactory = Symbol('AskAITerminalInputFactory');
export type AskAITerminalInputFactory = (args: AskAITerminalInputArgs) => AskAITerminalInputWidget;

@injectable()
export class AskAITerminalInputWidget extends AskAIInputWidgetBase {
    public static override ID = 'ask-ai-terminal-input-widget';

    @inject(AskAITerminalInputArgs) @optional()
    protected override readonly args: AskAITerminalInputArgs | undefined;

    @inject(AskAITerminalInputConfiguration) @optional()
    protected override readonly configuration: AskAITerminalInputConfiguration | undefined;

    protected override readonly chatAgentLocation = ChatAgentLocation.Panel;
    protected override get widgetId(): string { return AskAITerminalInputWidget.ID; }
}

export class AskAITerminalOverlay implements Disposable {
    protected readonly toDispose = new DisposableCollection();
    protected readonly containerNode: HTMLDivElement;
    protected readonly inputWidget: AskAITerminalInputWidget;

    protected readonly onSubmitEmitter = new Emitter<ChatRequest>();
    protected readonly onCancelEmitter = new Emitter<void>();

    readonly onSubmit: Event<ChatRequest> = this.onSubmitEmitter.event;
    readonly onCancel: Event<void> = this.onCancelEmitter.event;

    constructor(
        protected readonly terminalWidget: TerminalWidgetImpl,
        inputWidgetFactory: AskAITerminalInputFactory,
    ) {
        this.containerNode = document.createElement('div');
        this.containerNode.className = 'ai-terminal-ask-overlay';
        terminalWidget.node.appendChild(this.containerNode);

        this.inputWidget = inputWidgetFactory({
            onSubmit: event => this.handleSubmit(event),
            onCancel: () => this.handleCancel()
        });

        this.containerNode.appendChild(this.inputWidget.node);
        this.inputWidget.activate();
        this.inputWidget.update();

        this.toDispose.push(Disposable.create(() => {
            this.containerNode.remove();
        }));
        this.toDispose.push(this.terminalWidget.onDidDispose(() => this.dispose()));
        this.toDispose.push(this.inputWidget);

        this.toDispose.pushAll([
            this.onSubmitEmitter,
            this.onCancelEmitter,
            this.inputWidget
        ]);
    }

    dispose(): void {
        if (this.toDispose.disposed) {
            return;
        }
        this.toDispose.dispose();
    }

    protected handleSubmit(request: ChatRequest): void {
        this.onSubmitEmitter.fire(request);
        this.dispose();
    }

    protected handleCancel(): void {
        this.onCancelEmitter.fire();
        this.dispose();
    }
}
