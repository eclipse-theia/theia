/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MonacoWorkspace } from './monaco-workspace';
import {
    TextEditor,
    TextDocument,
    Dimension,
    Range,
    Position
} from "@theia/editor/lib/browser";
import { Event, DisposableCollection, Disposable, Emitter } from '@theia/core/lib/common';
import IEditorReference = monaco.editor.IEditorReference;
import IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from 'monaco-languageclient';
import URI from "@theia/core/lib/common/uri";
import { ElementExt } from "@phosphor/domutils";
import IBoxSizing = ElementExt.IBoxSizing;

export namespace MonacoCommonEditor {
    export interface IOptions {
        /**
         * Whether an editor should be auto resized on a content change.
         *
         * #### Fixme
         * remove when https://github.com/Microsoft/monaco-editor/issues/103 is resolved
         */
        autoSizing?: boolean;
        /**
         * A minimal height of an editor.
         *
         * #### Fixme
         * remove when https://github.com/Microsoft/monaco-editor/issues/103 is resolved
         */
        minHeight?: number;
    }
}

export abstract class MonacoCommonEditor implements TextEditor, IEditorReference {
    protected readonly toDispose = new DisposableCollection();
    protected readonly onSelectionChangedEmitter = new Emitter<Range>();
    protected readonly onCursorPositionChangedEmitter = new Emitter<Position>();
    protected readonly onFocusChangedEmitter = new Emitter<boolean>();

    protected abstract editor: IStandaloneCodeEditor;

    node: HTMLElement;
    uri: URI;

    protected readonly autoSizing: boolean;
    protected readonly minHeight: number;

    constructor(
        protected readonly m2p: MonacoToProtocolConverter,
        protected readonly p2m: ProtocolToMonacoConverter,
        protected readonly workspace: MonacoWorkspace,
        options?: MonacoCommonEditor.IOptions
    ) {
        this.autoSizing = options && options.autoSizing !== undefined ? options.autoSizing : false;
        this.minHeight = options && options.minHeight !== undefined ? options.minHeight : -1;
    }

    get onDispose() {
        return this.toDispose.onDispose;
    }

    get onCursorPositionChanged(): Event<Position> {
        return this.onCursorPositionChangedEmitter.event;
    }

    blur(): void {
        const node = this.editor.getDomNode();
        const textarea = node.querySelector('textarea') as HTMLElement;
        textarea.blur();
    }
    isFocused(): boolean {
        return this.editor.isFocused();
    }

    get onFocusChanged(): Event<boolean> {
        return this.onFocusChangedEmitter.event;
    }

    get cursor(): Position {
        const { lineNumber, column } = this.editor.getPosition();
        return this.m2p.asPosition(lineNumber, column);
    }

    set cursor(cursor: Position) {
        const position = this.p2m.asPosition(cursor);
        this.editor.setPosition(position);
    }

    get selection(): Range {
        return this.m2p.asRange(this.editor.getSelection());
    }

    set selection(selection: Range) {
        const range = this.p2m.asRange(selection);
        this.editor.setSelection(range);
    }

    get onSelectionChanged(): Event<Range> {
        return this.onSelectionChangedEmitter.event;
    }

    revealPosition(raw: Position): void {
        const position = this.p2m.asPosition(raw);
        this.editor.revealPositionInCenter(position);
    }

    revealRange(raw: Range): void {
        const range = this.p2m.asRange(raw);
        this.editor.revealRangeInCenter(range!);
    }

    focus() {
        this.editor.focus();
    }

    refresh(): void {
        this.autoresize();
    }
    resizeToFit(): void {
        this.autoresize();
    }

    setSize(size: Dimension): void {
        this.resize(size);
    }

    dispose() {
        this.toDispose.dispose();
    }

    get document(): TextDocument {
        return this.workspace.getTextDocument(this.uri.toString())!;
    }

    getControl() {
        return this.editor;
    }

    protected increaseZIndex(element: HTMLElement, z: string, toDisposeOnBlur: DisposableCollection) {
        const parent = element.parentElement;
        if (parent && !element.classList.contains('p-DockPanel')) {
            const oldIndex = element.style.zIndex;
            toDisposeOnBlur.push(Disposable.create(() =>
                element.style.zIndex = oldIndex
            ));
            element.style.zIndex = z;
            this.increaseZIndex(parent, z, toDisposeOnBlur);
        }
    }

    protected autoresize() {
        if (this.autoSizing) {
            this.resize(null);
        }
    }

    protected computeLayoutSize(hostNode: HTMLElement, dimension: monaco.editor.IDimension | null): monaco.editor.IDimension {
        if (dimension && dimension.width >= 0 && dimension.height >= 0) {
            return dimension;
        }
        const boxSizing = ElementExt.boxSizing(hostNode);

        const width = (!dimension || dimension.width < 0) ?
            this.getWidth(hostNode, boxSizing) :
            dimension.width;

        const height = (!dimension || dimension.height < 0) ?
            this.getHeight(hostNode, boxSizing) :
            dimension.height;

        return { width, height };
    }

    protected getWidth(hostNode: HTMLElement, boxSizing: IBoxSizing): number {
        return hostNode.offsetWidth - boxSizing.horizontalSum;
    }

    protected resize(dimension: Dimension | null): void {
        if (this.node) {
            const layoutSize = this.computeLayoutSize(this.node, dimension);
            this.editor.layout(layoutSize);
        }
    }

    protected getHeight(hostNode: HTMLElement, boxSizing: IBoxSizing): number {
        if (!this.autoSizing) {
            return hostNode.offsetHeight - boxSizing.verticalSum;
        }
        const configuration = this.editor.getConfiguration();

        const lineHeight = configuration.lineHeight;
        const lineCount = this.editor.getModel().getLineCount();
        const contentHeight = lineHeight * lineCount;

        const horizontalScrollbarHeight = configuration.layoutInfo.horizontalScrollbarHeight;

        const editorHeight = contentHeight + horizontalScrollbarHeight;
        if (this.minHeight < 0) {
            return editorHeight;
        }
        const defaultHeight = lineHeight * this.minHeight + horizontalScrollbarHeight;
        return Math.max(defaultHeight, editorHeight);
    }

    isActionSupported(id: string): boolean {
        const action = this.editor.getAction(id);
        return !!action && action.isSupported();
    }

    runAction(id: string): monaco.Promise<void> {
        const action = this.editor.getAction(id);
        if (action && action.isSupported()) {
            return action.run();
        }
        return monaco.Promise.as(undefined);
    }

    get commandService(): monaco.commands.ICommandService {
        return this.editor._commandService;
    }

    get instantiationService(): monaco.instantiation.IInstantiationService {
        return this.editor._instantiationService;
    }

}
