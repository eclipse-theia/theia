/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { Emitter, Event, RecursivePartial, SelectionService } from '@theia/core/lib/common';
import { OpenHandler, FrontendApplication } from "@theia/core/lib/browser";
import { EditorWidget } from "./editor-widget";
import { TextEditorProvider, Range, Position } from "./editor";
import { WidgetFactory, WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { Widget } from '@phosphor/widgets';
import { FileIconProvider } from '@theia/filesystem/lib/browser/icons/file-icons';
import { WorkspaceCommandContribution } from "@theia/workspace/lib/browser/workspace-commands";

export const EditorManager = Symbol("EditorManager");

export interface EditorManager extends OpenHandler {

    /**
     * All opened editors.
     */
    readonly editors: EditorWidget[];
    /**
     * Open an editor for the given uri and input.
     * Reject if the given input is not an editor input or an editor cannot be opened.
     */
    open(uri: URI, input?: EditorInput): Promise<EditorWidget>;

    /**
     * The most recently focused editor.
     */
    readonly currentEditor: EditorWidget | undefined;
    /**
     * Emit when the current editor changed.
     */
    readonly onCurrentEditorChanged: Event<EditorWidget | undefined>;
    /**
     * The currently focused editor.
     */
    readonly activeEditor: EditorWidget | undefined;
    /**
     * Emit when the active editor changed.
     */
    readonly onActiveEditorChanged: Event<EditorWidget | undefined>;
}

export interface EditorInput {
    revealIfVisible?: boolean;
    selection?: RecursivePartial<Range>;
}

@injectable()
export class EditorManagerImpl implements EditorManager, WidgetFactory {

    readonly id = "code-editor-opener";
    readonly label = "Code Editor";

    protected readonly currentObserver: EditorManagerImpl.Observer;
    protected readonly activeObserver: EditorManagerImpl.Observer;

    constructor(
        @inject(TextEditorProvider) protected readonly editorProvider: TextEditorProvider,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(FileIconProvider) protected readonly iconProvider: FileIconProvider,
        @inject(WorkspaceCommandContribution) protected readonly uiEvent: WorkspaceCommandContribution
    ) {
        this.currentObserver = new EditorManagerImpl.Observer('current', app);
        this.activeObserver = new EditorManagerImpl.Observer('active', app);
        uiEvent.onIUriChanged(event => {
            this.renameWidget(event.factoryId.toString(), event.options, event.newOptions, event.newLabel);
        });
    }

    get editors() {
        return this.widgetManager.getWidgets(this.id) as EditorWidget[];
    }

    get currentEditor() {
        return this.currentObserver.getEditor();
    }

    get onCurrentEditorChanged() {
        return this.currentObserver.onEditorChanged();
    }

    get activeEditor() {
        return this.activeObserver.getEditor();
    }

    get onActiveEditorChanged() {
        return this.activeObserver.onEditorChanged();
    }

    canHandle(uri: URI, input?: EditorInput): number {
        return 100;
    }

    open(uri: URI, input?: EditorInput): Promise<EditorWidget> {
        return this.widgetManager.getOrCreateWidget<EditorWidget>(this.id, uri.toString()).then(editor => {
            if (!editor.isAttached) {
                this.app.shell.addToMainArea(editor);
            }
            this.revealIfVisible(editor, input);
            this.revealSelection(editor, input);
            return editor;
        });
    }

    /*
     *  check if a widget exists already and rename it
     */
    renameWidget(factoryId: string, options: any, newOptions: any, newLabel: any): void {
        let key = this.widgetManager.toKey({ factoryId, options });
        let existingWidget = this.widgetManager.getWidgetsMap().get(key);
        if (existingWidget) {
            existingWidget.title.label = newLabel;
            this.updateWidgetKey(key, existingWidget, factoryId, options, newOptions);
        }
    }

    /*
     *  update a widget key following a rename
     */
    private updateWidgetKey(key: any, widget: Widget, factoryId: string, options: any, newOptions: any): void {
        this.widgetManager.getWidgetsMap().delete(key);
        options = newOptions;
        key = this.widgetManager.toKey({ factoryId, options });
        this.widgetManager.getWidgetsMap().set(key, widget);
    }

    // don't call directly, but use WidgetManager
    createWidget(uriAsString: string): Promise<Widget> {
        const uri = new URI(uriAsString);
        return this.createEditor(uri);
    }

    protected createEditor(uri: URI): Promise<EditorWidget> {
        return this.editorProvider(uri).then(textEditor => {
            const newEditor = new EditorWidget(textEditor, this.selectionService);
            newEditor.id = this.id + ":" + uri.toString();
            newEditor.title.closable = true;
            newEditor.title.label = uri.path.base;
            newEditor.title.iconClass = this.iconProvider.getFileIconForURI(textEditor.uri);
            return newEditor;
        });
    }

    protected revealIfVisible(editor: EditorWidget, input?: EditorInput): void {
        if (input === undefined || input.revealIfVisible === undefined || input.revealIfVisible) {
            this.app.shell.activateMain(editor.id);
        }
    }

    protected revealSelection(widget: EditorWidget, input?: EditorInput): void {
        if (input && input.selection) {
            const editor = widget.editor;
            const selection = this.getSelection(input.selection);
            if (Position.is(selection)) {
                editor.cursor = selection;
                editor.revealPosition(selection);
            } else if (Range.is(selection)) {
                editor.cursor = selection.end;
                editor.selection = selection;
                editor.revealRange(selection);
            }
        }
    }

    protected getSelection(selection: RecursivePartial<Range>): Range | Position | undefined {
        const { start, end } = selection;
        if (start && start.line !== undefined && start.line >= 0 &&
            start.character !== undefined && start.character >= 0) {
            if (end && end.line !== undefined && end.line >= 0 &&
                end.character !== undefined && end.character >= 0) {
                return selection as Range;
            }
            return start as Position;
        }
        return undefined;
    }
}

export namespace EditorManagerImpl {
    export class Observer {
        protected readonly onEditorChangedEmitter = new Emitter<EditorWidget | undefined>();

        constructor(
            protected readonly kind: 'current' | 'active',
            protected readonly app: FrontendApplication
        ) {
            const key = this.kind === 'current' ? 'currentChanged' : 'activeChanged';
            app.shell[key].connect((shell, arg) => {
                if (arg.newValue instanceof EditorWidget || arg.oldValue instanceof EditorWidget) {
                    this.onEditorChangedEmitter.fire(this.getEditor());
                }
            });
        }

        getEditor(): EditorWidget | undefined {
            if (this.app) {
                const key = this.kind === 'current' ? 'currentWidget' : 'activeWidget';
                const widget = this.app.shell[key];
                if (widget instanceof EditorWidget) {
                    return widget;
                }
            }
            return undefined;
        }

        onEditorChanged() {
            return this.onEditorChangedEmitter.event;
        }
    }
}
