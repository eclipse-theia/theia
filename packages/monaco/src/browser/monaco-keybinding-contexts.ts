/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { EditorWidget } from '@theia/editor/lib/browser/editor-widget';
import { StrictEditorTextFocusContext } from '@theia/editor/lib/browser/editor-keybinding-contexts';
import { MonacoEditor } from './monaco-editor';

/**
 * Besides checking whether this editor is the currently active one and has the focus, it also checks the followings:
 *  - the suggest widget is visible
 *  - the find (and replace) widget is visible.
 *  - the rename input widget (which we use for refactoring and not find and replace) is visible.
 *
 * If any of the above-mentioned additional checks evaluates to `true` the `canHandle` will evaluate to `false`.
 *
 * See: https://github.com/eamodio/vscode-gitlens/blob/57226d54d1e929be04b02ee31ca294c50305481b/package.json#L2857
 */
@injectable()
export class MonacoStrictEditorTextFocusContext extends StrictEditorTextFocusContext {

    protected canHandle(widget: EditorWidget): boolean {
        if (!super.canHandle(widget)) {
            return false;
        }
        const { editor } = widget;
        if (editor instanceof MonacoEditor) {
            return !editor.isSuggestWidgetVisible() && !editor.isFindWidgetVisible() && !editor.isRenameInputVisible();
        }
        return false;
    }

}
