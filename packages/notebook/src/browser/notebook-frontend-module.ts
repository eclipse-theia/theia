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

import { ContainerModule } from '@theia/core/shared/inversify';
import { NavigatableWidgetOptions, OpenHandler, WidgetFactory } from '@theia/core/lib/browser';
import { NotebookOpenHandler } from './notebookOpenHandler';
import { NotebookWidget } from './notebookWidget';
import { bindContributionProvider, URI } from '@theia/core';
import { NotebookTypeRegistry } from './notebookTypeRegistry';
import { NotebookService } from './notebook-service';

export default new ContainerModule(bind => {
    bindContributionProvider(bind, Symbol('notebooks'));

    bind(NotebookOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(NotebookOpenHandler);

    bind(NotebookTypeRegistry).toSelf().inSingletonScope();

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: NotebookWidget.ID,
        createWidget: (options: NavigatableWidgetOptions & { notebookType: string }): NotebookWidget => new NotebookWidget(new URI(options.uri), options.notebookType),
    }));

    bind(NotebookService).toSelf().inSingletonScope();
});
