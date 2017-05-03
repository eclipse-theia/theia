/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import URI from "../../application/common/uri";
import { Emitter, Event, RecursivePartial, SelectionService } from '../../application/common';
import { OpenHandler, TheiaApplication, TheiaPlugin } from "../../application/browser";
import { EditorWidget } from "./editor-widget";
import { EditorRegistry } from "./editor-registry";
import { TextEditorProvider, Range, Position } from "./editor";

export const EditorManager = Symbol("EditorManager");

export interface EditorManager extends OpenHandler, TheiaPlugin {
    /**
     * All opened editors.
     */
    readonly editors: EditorWidget[];
    /**
     * Emit when editors changed.
     */
    readonly onEditorsChanged: Event<void>;
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
export class EditorManagerImpl implements EditorManager {

    private _resolveApp: (app: TheiaApplication) => void;
    protected readonly resolveApp = new Promise<TheiaApplication>(resolve =>
        this._resolveApp = resolve
    );

    protected readonly currentObserver = new EditorManagerImpl.Observer('current', this.resolveApp);
    protected readonly activeObserver = new EditorManagerImpl.Observer('active', this.resolveApp);

    constructor(
        @inject(EditorRegistry) protected readonly editorRegistry: EditorRegistry,
        @inject(TextEditorProvider) protected readonly editorProvider: TextEditorProvider,
        @inject(SelectionService) protected readonly selectionService: SelectionService
    ) { }

    onStart(app: TheiaApplication): void {
        this._resolveApp(app);
    }

    get editors() {
        return this.editorRegistry.getOpenedEditors();
    }

    get onEditorsChanged() {
        return this.editorRegistry.onEditorsChanged();
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

    open(uri: URI, input?: EditorInput): Promise<EditorWidget> {
        return this.getOrCreateEditor(uri).then(editor => {
            this.revealIfVisible(editor, input);
            this.revealSelection(editor, input);
            return editor;
        });
    }

    protected getOrCreateEditor(uri: URI): Promise<EditorWidget> {
        return this.resolveApp.then(app => {
            const editor = this.editorRegistry.getEditor(uri);
            if (editor) {
                return editor;
            }
            return this.editorProvider(uri).then(textEditor => {
                const editor = new EditorWidget(textEditor, this.selectionService);
                editor.title.closable = true;
                editor.title.label = uri.lastSegment();
                this.editorRegistry.addEditor(uri, editor);
                editor.disposed.connect(() =>
                    this.editorRegistry.removeEditor(uri)
                );
                app.shell.addToMainArea(editor);
                return editor;
            });
        })
    }

    protected revealIfVisible(editor: EditorWidget, input?: EditorInput): void {
        if (input === undefined || input.revealIfVisible === undefined || input.revealIfVisible) {
            this.resolveApp.then(app =>
                app.shell.activateMain(editor.id)
            );
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
                editor.selection = selection;
                editor.revealRange(selection);
            }
        }
    }

    protected getSelection(selection: RecursivePartial<Range>): Range | Position | undefined {
        const { start, end } = selection;
        if (start && start.line && start.character) {
            if (end && end.line && end.character) {
                return selection as Range;
            }
            return start as Position;
        }
        return undefined;
    }

}

export namespace EditorManagerImpl {
    export class Observer {
        protected app: TheiaApplication | undefined;
        protected readonly onEditorChangedEmitter = new Emitter<EditorWidget | undefined>();

        constructor(
            protected readonly kind: 'current' | 'active',
            protected readonly ready: Promise<TheiaApplication>
        ) {
            this.ready.then(app =>
                this.initialize(app)
            );
        }

        protected initialize(app: TheiaApplication) {
            this.app = app
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
