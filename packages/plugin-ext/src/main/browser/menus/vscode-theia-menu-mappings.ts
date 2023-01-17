// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { MenuPath } from '@theia/core';
import { SHELL_TABBAR_CONTEXT_MENU } from '@theia/core/lib/browser';
import { Navigatable } from '@theia/core/lib/browser/navigatable';
import { injectable } from '@theia/core/shared/inversify';
import { URI as CodeUri } from '@theia/core/shared/vscode-uri';
import { DebugStackFramesWidget } from '@theia/debug/lib/browser/view/debug-stack-frames-widget';
import { DebugThreadsWidget } from '@theia/debug/lib/browser/view/debug-threads-widget';
import { DebugToolBar } from '@theia/debug/lib/browser/view/debug-toolbar-widget';
import { DebugVariablesWidget } from '@theia/debug/lib/browser/view/debug-variables-widget';
import { EditorWidget, EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { NAVIGATOR_CONTEXT_MENU } from '@theia/navigator/lib/browser/navigator-contribution';
import { ScmTreeWidget } from '@theia/scm/lib/browser/scm-tree-widget';
import { TIMELINE_ITEM_CONTEXT_MENU } from '@theia/timeline/lib/browser/timeline-tree-widget';
import { COMMENT_CONTEXT, COMMENT_THREAD_CONTEXT, COMMENT_TITLE } from '../comments/comment-thread-widget';
import { VIEW_ITEM_CONTEXT_MENU } from '../view/tree-view-widget';
import { WebviewWidget } from '../webview/webview';

export const PLUGIN_EDITOR_TITLE_MENU = ['plugin_editor/title'];
export const PLUGIN_SCM_TITLE_MENU = ['plugin_scm/title'];
export const PLUGIN_VIEW_TITLE_MENU = ['plugin_view/title'];

export const implementedVSCodeContributionPoints = [
    'comments/comment/context',
    'comments/comment/title',
    'comments/commentThread/context',
    'debug/callstack/context',
    'debug/variables/context',
    'debug/toolBar',
    'editor/context',
    'editor/title',
    'editor/title/context',
    'explorer/context',
    'scm/resourceFolder/context',
    'scm/resourceGroup/context',
    'scm/resourceState/context',
    'scm/title',
    'timeline/item/context',
    'view/item/context',
    'view/title'
] as const;

export type ContributionPoint = (typeof implementedVSCodeContributionPoints)[number];

/** The values are menu paths to which the VSCode contribution points correspond */
export const codeToTheiaMappings = new Map<ContributionPoint, MenuPath[]>([
    ['comments/comment/context', [COMMENT_CONTEXT]],
    ['comments/comment/title', [COMMENT_TITLE]],
    ['comments/commentThread/context', [COMMENT_THREAD_CONTEXT]],
    ['debug/callstack/context', [DebugStackFramesWidget.CONTEXT_MENU, DebugThreadsWidget.CONTEXT_MENU]],
    ['debug/variables/context', [DebugVariablesWidget.CONTEXT_MENU]],
    ['debug/toolBar', [DebugToolBar.MENU]],
    ['editor/context', [EDITOR_CONTEXT_MENU]],
    ['editor/title', [PLUGIN_EDITOR_TITLE_MENU]],
    ['editor/title/context', [SHELL_TABBAR_CONTEXT_MENU]],
    ['explorer/context', [NAVIGATOR_CONTEXT_MENU]],
    ['scm/resourceFolder/context', [ScmTreeWidget.RESOURCE_FOLDER_CONTEXT_MENU]],
    ['scm/resourceGroup/context', [ScmTreeWidget.RESOURCE_GROUP_CONTEXT_MENU]],
    ['scm/resourceState/context', [ScmTreeWidget.RESOURCE_CONTEXT_MENU]],
    ['scm/title', [PLUGIN_SCM_TITLE_MENU]],
    ['timeline/item/context', [TIMELINE_ITEM_CONTEXT_MENU]],
    ['view/item/context', [VIEW_ITEM_CONTEXT_MENU]],
    ['view/title', [PLUGIN_VIEW_TITLE_MENU]],
]);

type CodeEditorWidget = EditorWidget | WebviewWidget;
@injectable()
export class CodeEditorWidgetUtil {
    is(arg: unknown): arg is CodeEditorWidget {
        return arg instanceof EditorWidget || arg instanceof WebviewWidget;
    }
    getResourceUri(editor: CodeEditorWidget): CodeUri | undefined {
        const resourceUri = Navigatable.is(editor) && editor.getResourceUri();
        return resourceUri ? resourceUri['codeUri'] : undefined;
    }
}
