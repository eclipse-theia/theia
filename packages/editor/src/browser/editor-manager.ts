/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { RecursivePartial } from '@theia/core/lib/common';
import { FrontendApplication, WidgetOpenHandler, WidgetOpenerOptions } from "@theia/core/lib/browser";
import { EditorWidget } from "./editor-widget";
import { Range, Position } from "./editor";
import { EditorWidgetFactory } from "./editor-widget-factory";

export interface EditorOpenerOptions extends WidgetOpenerOptions {
    selection?: RecursivePartial<Range>;
}

@injectable()
export class EditorManager extends WidgetOpenHandler<EditorWidget> {

    readonly id = EditorWidgetFactory.ID;
    protected readonly widgetConstructor = EditorWidget;

    readonly label = "Code Editor";

    @inject(FrontendApplication)
    protected readonly app: FrontendApplication;

    async open(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget> {
        const editor = await super.open(uri, options);
        this.revealSelection(editor, options);
        return editor;
    }

    protected revealSelection(widget: EditorWidget, input?: EditorOpenerOptions): void {
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
