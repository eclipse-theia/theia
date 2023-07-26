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
import { OpenHandler, WidgetFactory } from '@theia/core/lib/browser';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { NotebookOpenHandler } from './notebook-open-handler';
import { bindContributionProvider, CommandContribution, MenuContribution, ResourceResolver, } from '@theia/core';
import { NotebookTypeRegistry } from './notebook-type-registry';
import { NotebookRendererRegistry } from './notebook-renderer-registry';
import { NotebookService } from './service/notebook-service';
import { NotebookEditorWidgetFactory } from './notebook-editor-widget-factory';
import { NotebookCellResourceResolver } from './notebook-cell-resource-resolver';
import { NotebookModelResolverService } from './service/notebook-model-resolver-service';
import { NotebookCellActionContribution } from './contributions/notebook-cell-actions-contribution';
import { NotebookCellToolbarFactory } from './view/notebook-cell-toolbar-factory';
import { createNotebookModelContainer, NotebookModel, NotebookModelFactory, NotebookModelProps } from './view-model/notebook-model';
import { createNotebookCellModelContainer, NotebookCellModel, NotebookCellModelFactory, NotebookCellModelProps } from './view-model/notebook-cell-model';
import { createNotebookEditorWidgetContainer, NotebookEditorContainerFactory, NotebookEditorProps, NotebookEditorWidget } from './notebook-editor-widget';
import { NotebookCodeCellRenderer } from './view/notebook-code-cell-view';
import { NotebookMarkdownCellRenderer } from './view/notebook-markdown-cell-view';
import { NotebookActionsContribution } from './contributions/notebook-actions-contribution';
import { NotebookExecutionService } from './service/notebook-execution-service';
import { NotebookExecutionStateService } from './service/notebook-execution-state-service';
import { NotebookKernelService } from './service/notebook-kernel-service';
import { KernelPickerMRUStrategy, NotebookKernelQuickPickService } from './service/notebook-kernel-quick-pick-service';
import { NotebookKernelHistoryService } from './service/notebookKernelHistoryService';
import { NotebookEditorWidgetService } from './service/notebook-editor-service';
import { NotebookRendererMessagingService } from './service/notebook-renderer-messaging-service';
import { NotebookColorContribution } from './contributions/notebook-color-contribution';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { notebookCellMonacoTextmodelService } from './view/notebook-cell-editor';

export default new ContainerModule(bind => {
    bindContributionProvider(bind, Symbol('notebooks'));

    bind(NotebookColorContribution).toSelf().inSingletonScope();
    bind(ColorContribution).toService(NotebookColorContribution);

    bind(NotebookOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(NotebookOpenHandler);

    bind(NotebookTypeRegistry).toSelf().inSingletonScope();
    bind(NotebookRendererRegistry).toSelf().inSingletonScope();

    bind(WidgetFactory).to(NotebookEditorWidgetFactory).inSingletonScope();
    bind(NotebookCellToolbarFactory).toSelf().inSingletonScope();

    bind(NotebookService).toSelf().inSingletonScope();
    bind(NotebookEditorWidgetService).toSelf().inSingletonScope();
    bind(NotebookExecutionService).toSelf().inSingletonScope();
    bind(NotebookExecutionStateService).toSelf().inSingletonScope();
    bind(NotebookKernelService).toSelf().inSingletonScope();
    bind(NotebookRendererMessagingService).toSelf().inSingletonScope();
    bind(NotebookKernelHistoryService).toSelf().inSingletonScope();
    // We nned a custom MonacoTextModelService here to avoid the other one trying to update the general documents without updating the notebook documents
    bind(notebookCellMonacoTextmodelService).to(MonacoTextModelService).inSingletonScope();
    bind(NotebookKernelQuickPickService).to(KernelPickerMRUStrategy).inSingletonScope();

    bind(NotebookCellResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(NotebookCellResourceResolver);
    bind(NotebookModelResolverService).toSelf().inSingletonScope();

    bind(NotebookCellActionContribution).toSelf().inSingletonScope();
    bind(MenuContribution).toService(NotebookCellActionContribution);
    bind(CommandContribution).toService(NotebookCellActionContribution);

    bind(NotebookActionsContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(NotebookActionsContribution);

    bind(NotebookCodeCellRenderer).toSelf().inSingletonScope();
    bind(NotebookMarkdownCellRenderer).toSelf().inSingletonScope();

    bind(NotebookEditorContainerFactory).toFactory(ctx => (props: NotebookEditorProps) =>
        createNotebookEditorWidgetContainer(ctx.container, props).get(NotebookEditorWidget)
    );
    bind(NotebookModelFactory).toFactory(ctx => (props: NotebookModelProps) =>
        createNotebookModelContainer(ctx.container, props).get(NotebookModel)
    );
    bind(NotebookCellModelFactory).toFactory(ctx => (props: NotebookCellModelProps) =>
        createNotebookCellModelContainer(ctx.container, props).get(NotebookCellModel)
    );
});
