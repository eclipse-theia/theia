/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import '../../src/browser/style/output.css';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { toArray } from '@theia/core/shared/@phosphor/algorithm';
import { IDragEvent } from '@theia/core/shared/@phosphor/dragdrop';
import { EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Message, BaseWidget, DockPanel, Widget, MessageLoop, StatefulWidget } from '@theia/core/lib/browser';
import { OutputUri } from '../common/output-uri';
import { OutputChannelManager, OutputChannel } from '../common/output-channel';
import { Emitter, Event, deepClone } from '@theia/core';

@injectable()
export class OutputWidget extends BaseWidget implements StatefulWidget {

    static readonly ID = 'outputView';

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    @inject(MonacoEditorProvider)
    protected readonly editorProvider: MonacoEditorProvider;

    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

    protected _state: OutputWidget.State = { locked: false };
    protected readonly editorContainer: DockPanel;
    protected readonly toDisposeOnSelectedChannelChanged = new DisposableCollection();
    protected readonly onStateChangedEmitter = new Emitter<OutputWidget.State>();

    constructor() {
        super();
        this.id = OutputWidget.ID;
        this.title.label = 'Output';
        this.title.caption = 'Output';
        this.title.iconClass = 'fa fa-flag';
        this.title.closable = true;
        this.addClass('theia-output');
        this.node.tabIndex = 0;
        this.editorContainer = new NoopDragOverDockPanel({ spacing: 0, mode: 'single-document' });
        this.editorContainer.addClass('editor-container');
        this.editorContainer.node.tabIndex = -1;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.pushAll([
            this.outputChannelManager.onChannelWasHidden(() => this.refreshEditorWidget()),
            this.outputChannelManager.onChannelWasShown(({ preserveFocus }) => this.refreshEditorWidget({ preserveFocus: !!preserveFocus })),
            this.toDisposeOnSelectedChannelChanged,
            this.onStateChangedEmitter,
            this.onStateChanged(() => this.update())
        ]);
        this.refreshEditorWidget();
    }

    storeState(): object {
        return this.state;
    }

    restoreState(oldState: object & Partial<OutputWidget.State>): void {
        const copy = deepClone(this.state);
        if (oldState.locked) {
            copy.locked = oldState.locked;
        }
        this.state = copy;
    }

    protected get state(): OutputWidget.State {
        return this._state;
    }

    protected set state(state: OutputWidget.State) {
        this._state = state;
        this.onStateChangedEmitter.fire(this._state);
    }

    protected async refreshEditorWidget({ preserveFocus }: { preserveFocus: boolean } = { preserveFocus: false }): Promise<void> {
        const { selectedChannel } = this;
        const editorWidget = this.editorWidget;
        if (selectedChannel && editorWidget) {
            // If the input is the current one, do nothing.
            const model = (editorWidget.editor as MonacoEditor).getControl().getModel();
            if (model && model.uri.toString() === selectedChannel.uri.toString()) {
                if (!preserveFocus) {
                    this.activate();
                }
                return;
            }
        }
        this.toDisposeOnSelectedChannelChanged.dispose();
        if (selectedChannel) {
            const widget = await this.createEditorWidget();
            if (widget) {
                this.editorContainer.addWidget(widget);
                this.toDisposeOnSelectedChannelChanged.pushAll([
                    Disposable.create(() => widget.close()),
                    selectedChannel.onContentChange(() => this.revealLastLine())
                ]);
                if (!preserveFocus) {
                    this.activate();
                }
                this.revealLastLine();
            }
        }
    }

    protected onAfterAttach(message: Message): void {
        super.onAfterAttach(message);
        Widget.attach(this.editorContainer, this.node);
        this.toDisposeOnDetach.push(Disposable.create(() => Widget.detach(this.editorContainer)));
    }

    protected onActivateRequest(message: Message): void {
        super.onActivateRequest(message);
        if (this.editor) {
            this.editor.focus();
        } else {
            this.node.focus();
        }
    }

    protected onResize(message: Widget.ResizeMessage): void {
        super.onResize(message);
        MessageLoop.sendMessage(this.editorContainer, Widget.ResizeMessage.UnknownSize);
        for (const widget of toArray(this.editorContainer.widgets())) {
            MessageLoop.sendMessage(widget, Widget.ResizeMessage.UnknownSize);
        }
    }

    protected onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.onResize(Widget.ResizeMessage.UnknownSize); // Triggers an editor widget resize. (#8361)
    }

    get onStateChanged(): Event<OutputWidget.State> {
        return this.onStateChangedEmitter.event;
    }

    clear(): void {
        if (this.selectedChannel) {
            this.selectedChannel.clear();
        }
    }

    selectAll(): void {
        const editor = this.editor;
        if (editor) {
            const model = editor.getControl().getModel();
            if (model) {
                const endLine = model.getLineCount();
                const endCharacter = model.getLineMaxColumn(endLine);
                editor.getControl().setSelection(new monaco.Range(1, 1, endLine, endCharacter));
            }
        }
    }

    lock(): void {
        this.state = { ...deepClone(this.state), locked: true };
    }

    unlock(): void {
        this.state = { ...deepClone(this.state), locked: false };
    }

    get isLocked(): boolean {
        return !!this.state.locked;
    }

    protected revealLastLine(): void {
        if (this.isLocked) {
            return;
        }
        const editor = this.editor;
        if (editor) {
            const model = editor.getControl().getModel();
            if (model) {
                const lineNumber = model.getLineCount();
                const column = model.getLineMaxColumn(lineNumber);
                editor.getControl().revealPosition({ lineNumber, column }, monaco.editor.ScrollType.Smooth);
            }
        }
    }

    private get selectedChannel(): OutputChannel | undefined {
        return this.outputChannelManager.selectedChannel;
    }

    private async createEditorWidget(): Promise<EditorWidget | undefined> {
        if (!this.selectedChannel) {
            return undefined;
        }
        const { name } = this.selectedChannel;
        const editor = await this.editorProvider.get(OutputUri.create(name));
        return new EditorWidget(editor, this.selectionService);
    }

    private get editorWidget(): EditorWidget | undefined {
        for (const widget of toArray(this.editorContainer.children())) {
            if (widget instanceof EditorWidget) {
                return widget;
            }
        }
        return undefined;
    }

    private get editor(): MonacoEditor | undefined {
        const widget = this.editorWidget;
        if (widget instanceof EditorWidget) {
            if (widget.editor instanceof MonacoEditor) {
                return widget.editor;
            }
        }
        return undefined;
    }

    getText(): string | undefined {
        return this.editor?.getControl().getModel()?.getValue();
    }

}

export namespace OutputWidget {
    export interface State {
        locked?: boolean;
    }
}

/**
 * @deprecated Use `OutputWidget.ID` instead.
 */
export const OUTPUT_WIDGET_KIND = OutputWidget.ID;

/**
 * Customized `DockPanel` that does not allow dropping widgets into it.
 * Intercepts `'p-dragover'` events, and sets the desired drop action to `'none'`.
 */
class NoopDragOverDockPanel extends DockPanel {

    constructor(options?: DockPanel.IOptions) {
        super(options);
        NoopDragOverDockPanel.prototype['_evtDragOver'] = (event: IDragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            event.dropAction = 'none';
        };
    }

}
