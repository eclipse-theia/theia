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

import { ChatRequest } from '@theia/ai-chat';
import { Disposable } from '@theia/core/lib/common/disposable';
import { Emitter, Event } from '@theia/core/lib/common/event';
import * as monaco from '@theia/monaco-editor-core';
import { MonacoEditorZoneWidget } from '@theia/monaco/lib/browser/monaco-editor-zone-widget';
import { AskAIInputFactory, AskAIInputWidget } from './ask-ai-input-widget';

/**
 * A widget that shows the Ask AI input UI in a Monaco editor zone.
 */
export class AskAIInputMonacoZoneWidget extends MonacoEditorZoneWidget implements Disposable {
    protected readonly inputWidget: AskAIInputWidget;

    protected readonly onSubmitEmitter = new Emitter<ChatRequest>();
    protected readonly onCancelEmitter = new Emitter<void>();

    readonly onSubmit: Event<ChatRequest> = this.onSubmitEmitter.event;
    readonly onCancel: Event<void> = this.onCancelEmitter.event;

    constructor(
        editorInstance: monaco.editor.ICodeEditor,
        inputWidgetFactory: AskAIInputFactory
    ) {
        super(editorInstance, false /* showArrow */);

        this.containerNode.classList.add('ask-ai-input-monaco-zone-widget');

        this.inputWidget = inputWidgetFactory({
            onSubmit: event => this.handleSubmit(event),
            onCancel: () => this.handleCancel()
        });

        this.inputWidget.onDidResize(() => this.adjustZoneHeight());

        this.toDispose.pushAll([
            this.onSubmitEmitter,
            this.onCancelEmitter,
            this.inputWidget,
        ]);
    }

    override show(options: MonacoEditorZoneWidget.Options): void {
        super.show(options);
        this.renderReactWidget();
        this.registerListeners();
    }

    showAtLine(lineNumber: number): void {
        const options: MonacoEditorZoneWidget.Options = {
            afterLineNumber: lineNumber,
            heightInLines: 5,
            frameWidth: 1,
            showFrame: true,
        };
        this.show(options);
    }

    protected renderReactWidget(): void {
        this.containerNode.append(this.inputWidget.node);
        this.inputWidget.activate();
        this.inputWidget.update();
    }

    protected adjustZoneHeight(): void {
        if (!this.viewZone) {
            return;
        }

        const editorLineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
        const zoneWidgetHeight = this.inputWidget.node.parentElement ? this.inputWidget.node.parentElement.scrollHeight : this.inputWidget.node.scrollHeight;

        const requiredLines = Math.max(5, Math.ceil(zoneWidgetHeight / editorLineHeight));

        if (this.viewZone.heightInLines !== requiredLines) {
            this.layout(requiredLines);
        }
    }

    protected handleSubmit(request: ChatRequest): void {
        this.onSubmitEmitter.fire(request);
        this.hide();
    }

    protected handleCancel(): void {
        this.onCancelEmitter.fire();
        this.hide();
    }

    protected registerListeners(): void {
        this.toHide.push(this.editor.onKeyDown(e => {
            if (e.keyCode === monaco.KeyCode.Escape) {
                this.handleCancel();
                e.preventDefault();
                e.stopPropagation();
            }
        }));
    }
}
