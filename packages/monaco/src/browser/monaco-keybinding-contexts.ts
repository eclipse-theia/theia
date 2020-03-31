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

import { inject, injectable } from 'inversify';
import { EditorWidget } from '@theia/editor/lib/browser/editor-widget';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { NativeTextInputFocusContext } from '@theia/core/lib/browser/keybinding';
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
        const { editor } = widget;
        if (editor instanceof MonacoEditor) {
            return editor.isFocused({ strict: true });
        }
        return super.canHandle(widget);
    }

}

/**
 * The Monaco editor itself is a `textArea` so we have to restrict the default native text input focus context.
 * It is enabled if the focus is on an `input` or `textArea` and not contained in a Monaco editor.
 *
 * Notes: if we do not customize the default behavior we would get two matching bindings for the `Undo`, for instance:
 * `core.undo` with `nativeTextInputFocus` context, and `undo` from monaco with `textInputFocus && !editorReadonly` when.
 * Both are valid and enabled but `KeybindingRegistry#run` picks the first matching, which is the `core.undo`. It's incorrect.
 */
@injectable()
export class MonacoNativeTextInputFocusContext extends NativeTextInputFocusContext {

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    isEnabled(): boolean {
        return super.isEnabled() && !this.contextKeyService.match('editorFocus');
    }

}
