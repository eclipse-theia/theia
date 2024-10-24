// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import {
    FrontendApplicationContribution, KeybindingContribution, LabelProviderContribution, OpenHandler, UndoRedoHandler, WidgetFactory, WidgetStatusBarContribution
} from '@theia/core/lib/browser';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { NotebookOpenHandler } from './notebook-open-handler';
import { CommandContribution, MenuContribution, ResourceResolver, } from '@theia/core';
import { NotebookTypeRegistry } from './notebook-type-registry';
import { NotebookRendererRegistry } from './notebook-renderer-registry';
import { NotebookService } from './service/notebook-service';
import { NotebookEditorWidgetFactory } from './notebook-editor-widget-factory';
import { NotebookCellResourceResolver, NotebookOutputResourceResolver } from './notebook-cell-resource-resolver';
import { NotebookModelResolverService } from './service/notebook-model-resolver-service';
import { NotebookCellActionContribution } from './contributions/notebook-cell-actions-contribution';
import { createNotebookModelContainer, NotebookModel, NotebookModelFactory, NotebookModelProps, NotebookModelResolverServiceProxy } from './view-model/notebook-model';
import { createNotebookCellModelContainer, NotebookCellModel, NotebookCellModelFactory, NotebookCellModelProps } from './view-model/notebook-cell-model';
import { createNotebookEditorWidgetContainer, NotebookEditorWidgetContainerFactory, NotebookEditorProps, NotebookEditorWidget } from './notebook-editor-widget';
import { NotebookActionsContribution } from './contributions/notebook-actions-contribution';
import { NotebookExecutionService } from './service/notebook-execution-service';
import { NotebookExecutionStateService } from './service/notebook-execution-state-service';
import { NotebookKernelService } from './service/notebook-kernel-service';
import { NotebookKernelQuickPickService } from './service/notebook-kernel-quick-pick-service';
import { NotebookKernelHistoryService } from './service/notebook-kernel-history-service';
import { NotebookEditorWidgetService } from './service/notebook-editor-widget-service';
import { NotebookRendererMessagingService } from './service/notebook-renderer-messaging-service';
import { NotebookColorContribution } from './contributions/notebook-color-contribution';
import { NotebookMonacoTextModelService } from './service/notebook-monaco-text-model-service';
import { NotebookOutlineContribution } from './contributions/notebook-outline-contribution';
import { NotebookLabelProviderContribution } from './contributions/notebook-label-provider-contribution';
import { NotebookOutputActionContribution } from './contributions/notebook-output-action-contribution';
import { NotebookClipboardService } from './service/notebook-clipboard-service';
import { bindNotebookPreferences } from './contributions/notebook-preferences';
import { NotebookOptionsService } from './service/notebook-options';
import { NotebookUndoRedoHandler } from './contributions/notebook-undo-redo-handler';
import { NotebookStatusBarContribution } from './contributions/notebook-status-bar-contribution';
import { NotebookCellEditorService } from './service/notebook-cell-editor-service';
import { NotebookCellStatusBarService } from './service/notebook-cell-status-bar-service';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(NotebookColorContribution).toSelf().inSingletonScope();
    bind(ColorContribution).toService(NotebookColorContribution);

    bind(NotebookOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(NotebookOpenHandler);

    bind(NotebookTypeRegistry).toSelf().inSingletonScope();
    bind(NotebookRendererRegistry).toSelf().inSingletonScope();

    bind(WidgetFactory).to(NotebookEditorWidgetFactory).inSingletonScope();

    bind(NotebookService).toSelf().inSingletonScope();
    bind(NotebookEditorWidgetService).toSelf().inSingletonScope();
    bind(NotebookExecutionService).toSelf().inSingletonScope();
    bind(NotebookExecutionStateService).toSelf().inSingletonScope();
    bind(NotebookKernelService).toSelf().inSingletonScope();
    bind(NotebookRendererMessagingService).toSelf().inSingletonScope();
    bind(NotebookKernelHistoryService).toSelf().inSingletonScope();
    bind(NotebookKernelQuickPickService).toSelf().inSingletonScope();
    bind(NotebookClipboardService).toSelf().inSingletonScope();
    bind(NotebookCellEditorService).toSelf().inSingletonScope();
    bind(NotebookCellStatusBarService).toSelf().inSingletonScope();

    bind(NotebookCellResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(NotebookCellResourceResolver);
    bind(NotebookModelResolverService).toSelf().inSingletonScope();
    bind(NotebookModelResolverServiceProxy).toService(NotebookModelResolverService);
    bind(NotebookOutputResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(NotebookOutputResourceResolver);

    bind(NotebookCellActionContribution).toSelf().inSingletonScope();
    bind(MenuContribution).toService(NotebookCellActionContribution);
    bind(CommandContribution).toService(NotebookCellActionContribution);
    bind(KeybindingContribution).toService(NotebookCellActionContribution);

    bind(NotebookActionsContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(NotebookActionsContribution);
    bind(MenuContribution).toService(NotebookActionsContribution);
    bind(KeybindingContribution).toService(NotebookActionsContribution);

    bind(NotebookOutputActionContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(NotebookOutputActionContribution);

    bind(NotebookEditorWidgetContainerFactory).toFactory(ctx => (props: NotebookEditorProps) =>
        createNotebookEditorWidgetContainer(ctx.container, props).get(NotebookEditorWidget)
    );
    bind(NotebookModelFactory).toFactory(ctx => (props: NotebookModelProps) =>
        createNotebookModelContainer(ctx.container, props).get(NotebookModel)
    );
    bind(NotebookCellModelFactory).toFactory(ctx => (props: NotebookCellModelProps) =>
        createNotebookCellModelContainer(ctx.container, props).get(NotebookCellModel)
    );

    bind(NotebookMonacoTextModelService).toSelf().inSingletonScope();

    bind(NotebookOutlineContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(NotebookOutlineContribution);
    bind(NotebookLabelProviderContribution).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(NotebookLabelProviderContribution);

    bindNotebookPreferences(bind);
    bind(NotebookOptionsService).toSelf().inSingletonScope();

    bind(NotebookUndoRedoHandler).toSelf().inSingletonScope();
    bind(UndoRedoHandler).toService(NotebookUndoRedoHandler);

    bind(NotebookStatusBarContribution).toSelf().inSingletonScope();
    bind(WidgetStatusBarContribution).toService(NotebookStatusBarContribution);
});
