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
import { AskAIInputBaseArgs, AskAIInputBaseConfiguration, AskAIInputWidgetBase } from '@theia/ai-chat-ui/lib/browser/ask-ai-input-widget-base';
import { Disposable, DisposableCollection } from '@theia/core';
import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { TerminalWidgetImpl } from '@theia/terminal/lib/browser/terminal-widget-impl';

export const AskAITerminalInputConfiguration = Symbol('AskAITerminalInputConfiguration');
export interface AskAITerminalInputConfiguration extends AskAIInputBaseConfiguration { }

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
    protected disposed = false;

    constructor(
        protected readonly terminalWidget: TerminalWidgetImpl,
        inputWidgetFactory: AskAITerminalInputFactory,
        onSubmit: (chatRequest: ChatRequest) => void | Promise<void>,
        onCancel: () => void,
        onDispose: () => void
    ) {
        this.containerNode = document.createElement('div');
        this.containerNode.className = 'ai-terminal-ask-overlay';
        terminalWidget.node.appendChild(this.containerNode);
        this.toDispose.push(Disposable.create(() => {
            if (this.containerNode.parentNode) {
                this.containerNode.remove();
            }
        }));
        this.toDispose.push(Disposable.create(onDispose));
        this.toDispose.push(this.terminalWidget.onDidDispose(() => this.dispose()));

        this.inputWidget = inputWidgetFactory({
            onSubmit,
            onCancel
        });
        this.toDispose.push(this.inputWidget);

        this.containerNode.appendChild(this.inputWidget.node);
        this.inputWidget.activate();
        this.inputWidget.update();
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.toDispose.dispose();
    }
}
