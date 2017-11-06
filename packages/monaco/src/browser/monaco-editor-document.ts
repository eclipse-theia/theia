/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from "monaco-languageclient";
import { Emitter, Event, DisposableCollection } from "@theia/core";
import { TextEditorDocument, Position } from "@theia/editor/lib/browser";
import { MonacoEditorModel } from "./monaco-editor-model";

export class MonacoEditorDocument implements TextEditorDocument {

    protected readonly toDispose = new DisposableCollection();

    constructor(
        protected readonly model: MonacoEditorModel,
        protected readonly m2p: MonacoToProtocolConverter,
        protected readonly p2m: ProtocolToMonacoConverter
    ) {
        this.toDispose.push(this.onDirtyChangedEmitter);
        this.toDispose.push(this.model.textEditorModel.onDidChangeContent(() => this.setDirty(true)));
        this.toDispose.push(this.model.onDidSaveModel(() => this.setDirty(false)));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get uri(): string {
        return this.model.textEditorModel.uri.toString();
    }

    get languageId(): string {
        return this.model.textEditorModel.getModeId();
    }

    get version(): number {
        return this.model.textEditorModel.getVersionId();
    }

    getText(): string {
        return this.model.textEditorModel.getValue();
    }

    positionAt(offset: number): Position {
        const { lineNumber, column } = this.model.textEditorModel.getPositionAt(offset);
        return this.m2p.asPosition(lineNumber, column);
    }

    offsetAt(position: Position): number {
        return this.model.textEditorModel.getOffsetAt(this.p2m.asPosition(position));
    }

    get lineCount(): number {
        return this.model.textEditorModel.getLineCount();
    }

    protected _dirty = false;
    get dirty(): boolean {
        return this._dirty;
    }
    protected setDirty(dirty: boolean): void {
        this._dirty = dirty;
        this.onDirtyChangedEmitter.fire(undefined);
    }

    protected readonly onDirtyChangedEmitter = new Emitter<void>();
    get onDirtyChanged(): Event<void> {
        return this.onDirtyChangedEmitter.event;
    }

    async save(): Promise<void> {
        if (this.dirty) {
            this.setDirty(false);
            try {
                await this.model.save();
            } catch (e) {
                this.setDirty(true);
                throw e;
            }
        }
    }

}
