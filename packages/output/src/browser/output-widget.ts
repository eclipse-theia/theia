// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import '../../src/browser/style/output.css';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Message, BaseWidget, DockPanel, Widget, MessageLoop, StatefulWidget, codicon, StorageService } from '@theia/core/lib/browser';
import { OutputUri } from '../common/output-uri';
import { OutputChannelManager, OutputChannel } from './output-channel';
import { Emitter, Event, deepClone } from '@theia/core';
import { nls } from '@theia/core/lib/common/nls';
import * as monaco from '@theia/monaco-editor-core';

@injectable()
export class OutputWidget extends BaseWidget implements StatefulWidget {

    static readonly ID = 'outputView';
    static readonly LABEL = nls.localizeByDefault('Output');
    static readonly SELECTED_CHANNEL_STORAGE_KEY = 'output-widget-selected-channel';

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    @inject(MonacoEditorProvider)
    protected readonly editorProvider: MonacoEditorProvider;

    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

    @inject(StorageService)
    protected readonly storageService: StorageService;

    protected _state: OutputWidget.State = { locked: false };
    protected readonly editorContainer: DockPanel;
    protected readonly toDisposeOnSelectedChannelChanged = new DisposableCollection();
    protected readonly onStateChangedEmitter = new Emitter<OutputWidget.State>();

    constructor() {
        super();
        this.id = OutputWidget.ID;
        this.title.label = OutputWidget.LABEL;
        this.title.caption = OutputWidget.LABEL;
        this.title.iconClass = codicon('output');
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
            this.outputChannelManager.onChannelAdded(({ name }) => {
                this.tryRestorePendingChannel(name);
                this.refreshEditorWidget();
            }),
            this.outputChannelManager.onChannelDeleted(() => this.refreshEditorWidget()),
            this.outputChannelManager.onChannelWasHidden(() => this.refreshEditorWidget()),
            this.outputChannelManager.onChannelWasShown(({ preserveFocus }) => {
                // User explicitly showed a channel, clear any pending restoration
                // so we don't override their choice when the pending channel is registered later
                this.clearPendingChannelRestore();
                this.refreshEditorWidget({ preserveFocus: !!preserveFocus });
            }),
            this.outputChannelManager.onSelectedChannelChanged(() => this.refreshEditorWidget()),
            this.toDisposeOnSelectedChannelChanged,
            this.onStateChangedEmitter,
            this.onStateChanged(() => this.update())
        ]);
        this.restoreSelectedChannelFromStorage();
        this.refreshEditorWidget();
    }

    /**
     * Restore the selected channel from storage (used when widget is reopened).
     * State restoration has higher priority, so this only applies if state restoration hasn't already
     * set a selectedChannelName or pendingSelectedChannelName.
     */
    protected async restoreSelectedChannelFromStorage(): Promise<void> {
        const storedChannelName = await this.storageService.getData<string>(OutputWidget.SELECTED_CHANNEL_STORAGE_KEY);
        // Only apply storage restoration if state restoration hasn't provided a channel
        if (storedChannelName && !this._state.selectedChannelName && !this._state.pendingSelectedChannelName) {
            const channel = this.outputChannelManager.getVisibleChannels().find(ch => ch.name === storedChannelName);
            if (channel) {
                this.outputChannelManager.selectedChannel = channel;
                this.refreshEditorWidget();
            } else {
                // Channel not yet available, store as pending
                this._state = { ...this._state, pendingSelectedChannelName: storedChannelName };
            }
        }
    }

    override dispose(): void {
        // Save the selected channel to storage before disposing
        const channelName = this.selectedChannel?.name;
        if (channelName) {
            this.storageService.setData(OutputWidget.SELECTED_CHANNEL_STORAGE_KEY, channelName);
        }
        super.dispose();
    }

    /**
     * Try to restore the pending channel if it matches the newly added channel.
     */
    protected tryRestorePendingChannel(addedChannelName: string): void {
        const pendingName = this._state.pendingSelectedChannelName;
        if (pendingName && pendingName === addedChannelName) {
            const channel = this.outputChannelManager.getVisibleChannels().find(ch => ch.name === pendingName);
            if (channel) {
                this.outputChannelManager.selectedChannel = channel;
                this.clearPendingChannelRestore();
            }
        }
    }

    /**
     * Clear any pending channel restoration.
     * Called when the user explicitly selects a channel, so we don't override their choice.
     */
    protected clearPendingChannelRestore(): void {
        if (this._state.pendingSelectedChannelName) {
            this._state = { ...this._state, pendingSelectedChannelName: undefined };
        }
    }

    storeState(): object {
        const { locked, selectedChannelName } = this.state;
        const result: OutputWidget.State = { locked };
        // Store the selected channel name, preferring the actual current selection
        // over any pending restoration that hasn't completed yet
        if (this.selectedChannel) {
            result.selectedChannelName = this.selectedChannel.name;
        } else if (selectedChannelName) {
            result.selectedChannelName = selectedChannelName;
        }
        return result;
    }

    restoreState(oldState: object & Partial<OutputWidget.State>): void {
        const copy = deepClone(this.state);
        if (oldState.locked) {
            copy.locked = oldState.locked;
        }
        if (oldState.selectedChannelName) {
            copy.selectedChannelName = oldState.selectedChannelName;
            // Try to restore the selected channel in the manager if it exists
            const channels = this.outputChannelManager.getVisibleChannels();
            const channel = channels.find(ch => ch.name === oldState.selectedChannelName);
            if (channel) {
                this.outputChannelManager.selectedChannel = channel;
            } else {
                // Channel not yet available (e.g., registered by an extension that loads later).
                // Store as pending and wait for it to be added.
                copy.pendingSelectedChannelName = oldState.selectedChannelName;
            }
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

    protected override onAfterAttach(message: Message): void {
        super.onAfterAttach(message);
        Widget.attach(this.editorContainer, this.node);
        this.toDisposeOnDetach.push(Disposable.create(() => Widget.detach(this.editorContainer)));
    }

    protected override onActivateRequest(message: Message): void {
        super.onActivateRequest(message);
        if (this.editor) {
            this.editor.focus();
        } else {
            this.node.focus();
        }
    }

    protected override onResize(message: Widget.ResizeMessage): void {
        super.onResize(message);
        MessageLoop.sendMessage(this.editorContainer, Widget.ResizeMessage.UnknownSize);
        for (const widget of this.editorContainer.widgets()) {
            MessageLoop.sendMessage(widget, Widget.ResizeMessage.UnknownSize);
        }
    }

    protected override onAfterShow(msg: Message): void {
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
        for (const widget of this.editorContainer.children()) {
            if (widget instanceof EditorWidget) {
                return widget;
            }
        }
        return undefined;
    }

    private get editor(): MonacoEditor | undefined {
        return MonacoEditor.get(this.editorWidget);
    }

    getText(): string | undefined {
        return this.editor?.getControl().getModel()?.getValue();
    }

}

export namespace OutputWidget {
    export interface State {
        locked?: boolean;
        selectedChannelName?: string;
        /** Channel name waiting to be restored when it becomes available */
        pendingSelectedChannelName?: string;
    }
}

/**
 * Customized `DockPanel` that does not allow dropping widgets into it.
 */
class NoopDragOverDockPanel extends DockPanel { }
NoopDragOverDockPanel.prototype['_evtDragOver'] = () => { };
NoopDragOverDockPanel.prototype['_evtDrop'] = () => { };
NoopDragOverDockPanel.prototype['_evtDragLeave'] = () => { };
