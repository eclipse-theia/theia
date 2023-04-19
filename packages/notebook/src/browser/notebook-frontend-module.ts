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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************
import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { OpenHandler, WidgetFactory } from '@theia/core/lib/browser';
import { NotebookOpenHandler } from './notebook-open-handler';
import { bindContributionProvider, CommandContribution, MenuContribution, ResourceResolver, } from '@theia/core';
import { NotebookTypeRegistry } from './notebook-type-registry';
import { NotebookService } from './service/notebook-service';
import { NotebookEditorWidgetFactory } from './notebook-editor-widget-factory';
import { NotebookCellResourceResolver } from './notebook-cell-resource-resolver';
import { NotebookModelResolverService } from './service/notebook-model-resolver-service';
import { NotebookCellActionContribution } from './contributions/notebook-cell-actions-contribution';
import { NotebookCellToolbarFactory } from './view/notebook-cell-toolbar-factory';
import { NotebookContextKeyService } from './contributions/notebook-context-keys';

export default new ContainerModule(bind => {
    bindContributionProvider(bind, Symbol('notebooks'));

    bind(NotebookOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(NotebookOpenHandler);

    bind(NotebookTypeRegistry).toSelf().inSingletonScope();

    bind(WidgetFactory).to(NotebookEditorWidgetFactory).inSingletonScope();
    bind(NotebookCellToolbarFactory).toSelf().inSingletonScope();

    bind(NotebookService).toSelf().inSingletonScope();

    bind(NotebookCellResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(NotebookCellResourceResolver);
    bind(NotebookModelResolverService).toSelf().inSingletonScope();

    bind(NotebookCellActionContribution).toSelf().inSingletonScope();
    bind(MenuContribution).toService(NotebookCellActionContribution);
    bind(CommandContribution).toService(NotebookCellActionContribution);
    bind(NotebookContextKeyService).toSelf().inSingletonScope();
});
