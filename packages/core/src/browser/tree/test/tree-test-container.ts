/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { TreeImpl, Tree } from '../tree';
import { TreeModel, TreeModelImpl } from '../tree-model';
import { Container } from 'inversify';
import { TreeSelectionServiceImpl } from '../tree-selection-impl';
import { TreeSelectionService } from '../tree-selection';
import { TreeExpansionServiceImpl, TreeExpansionService } from '../tree-expansion';
import { TreeNavigationService } from '../tree-navigation';
import { TreeSearch } from '../tree-search';
import { FuzzySearch } from '../fuzzy-search';
import { MockLogger } from '../../../common/test/mock-logger';
import { ILogger, bindContributionProvider } from '../../../common';
import { LabelProviderContribution, LabelProvider } from '../../label-provider';

export function createTreeTestContainer(): Container {
    const container = new Container({ defaultScope: 'Singleton' });
    container.bind(TreeImpl).toSelf();
    container.bind(Tree).toService(TreeImpl);
    container.bind(TreeSelectionServiceImpl).toSelf();
    container.bind(TreeSelectionService).toService(TreeSelectionServiceImpl);
    container.bind(TreeExpansionServiceImpl).toSelf();
    container.bind(TreeExpansionService).toService(TreeExpansionServiceImpl);
    container.bind(TreeNavigationService).toSelf();
    container.bind(TreeModelImpl).toSelf();
    container.bind(TreeModel).toService(TreeModelImpl);
    container.bind(TreeSearch).toSelf();
    container.bind(FuzzySearch).toSelf();
    container.bind(MockLogger).toSelf();
    container.bind(ILogger).to(MockLogger);
    bindContributionProvider(container, LabelProviderContribution);
    container.bind(LabelProvider).toSelf().inSingletonScope();
    return container;
}
