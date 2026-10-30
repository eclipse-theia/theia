// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import '../../../src/browser/style/multi-diff-editor.css';

import { interfaces } from '@theia/core/shared/inversify';
import { CommandContribution, URI } from '@theia/core';
import { KeybindingContribution, LabelProviderContribution, NavigatableWidgetOptions, OpenHandler, WidgetFactory } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { MultiDiffEditorOpenHandler, MultiDiffEditorLabelProvider } from './multi-diff-editor';
import { MultiDiffEditorContribution } from './multi-diff-editor-contribution';
import { MultiDiffEditorWidgetFactory } from './multi-diff-editor-widget-factory';

export function bindMultiDiffEditor(bind: interfaces.Bind): void {
    bind(MultiDiffEditorWidgetFactory).toDynamicValue(ctx => new MultiDiffEditorWidgetFactory(ctx.container)).inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: MultiDiffEditorOpenHandler.ID,
        createWidget: (options: NavigatableWidgetOptions) => ctx.container.get(MultiDiffEditorWidgetFactory).createMultiDiffEditor(new URI(options.uri))
    })).inSingletonScope();

    bind(MultiDiffEditorOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(MultiDiffEditorOpenHandler);
    bind(LabelProviderContribution).to(MultiDiffEditorLabelProvider).inSingletonScope();

    bind(MultiDiffEditorContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, KeybindingContribution, TabBarToolbarContribution]) {
        bind(identifier).toService(MultiDiffEditorContribution);
    }
}
