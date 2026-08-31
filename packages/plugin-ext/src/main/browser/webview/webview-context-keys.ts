// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { ApplicationShell, FocusTracker, Widget, WidgetContextKeyContribution } from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CustomEditorWidget } from '../custom-editors/custom-editor-widget';
import { CodeEditorWidgetUtil } from '../menus/vscode-theia-menu-mappings';
import { WebviewWidget } from './webview';

const ACTIVE_WEBVIEW_PANEL_ID = 'activeWebviewPanelId';
const ACTIVE_CUSTOM_EDITOR_ID = 'activeCustomEditorId';

@injectable()
export class WebviewContextKeys implements WidgetContextKeyContribution {

    /**
     * Context key representing the `viewType` of the active `WebviewWidget`, if any.
     */
    activeWebviewPanelId: ContextKey<string>;

    /**
     * Context key representing the `viewType` of the active `CustomEditorWidget`, if any.
     */
    activeCustomEditorId: ContextKey<string>;

    @inject(ApplicationShell)
    protected applicationShell: ApplicationShell;

    @inject(ContextKeyService)
    protected contextKeyService: ContextKeyService;

    @postConstruct()
    protected init(): void {
        this.activeWebviewPanelId = this.contextKeyService.createKey(ACTIVE_WEBVIEW_PANEL_ID, '');
        this.activeCustomEditorId = this.contextKeyService.createKey(ACTIVE_CUSTOM_EDITOR_ID, '');
        this.applicationShell.onDidChangeCurrentWidget(this.handleDidChangeCurrentWidget, this);
    }

    getContextKeyValues(widget: Widget): Iterable<[string, unknown]> | undefined {
        // A view toolbar item may key on the *active* editor, so only the editor-like widgets these keys can
        // describe get an answer; everything else keeps the ambient value.
        if (!CodeEditorWidgetUtil.is(widget)) {
            return undefined;
        }
        return [
            [ACTIVE_CUSTOM_EDITOR_ID, widget instanceof CustomEditorWidget ? widget.viewType : ''],
            [ACTIVE_WEBVIEW_PANEL_ID, widget instanceof WebviewWidget ? widget.viewType : '']
        ];
    }

    protected handleDidChangeCurrentWidget(change: FocusTracker.IChangedArgs<Widget>): void {
        const { newValue } = change;
        if (newValue instanceof CustomEditorWidget) {
            this.activeCustomEditorId.set(newValue.viewType);
        } else {
            this.activeCustomEditorId.set('');
        }
        if (newValue instanceof WebviewWidget) {
            this.activeWebviewPanelId.set(newValue.viewType);
        } else {
            this.activeWebviewPanelId.set('');
        }
    }
}
