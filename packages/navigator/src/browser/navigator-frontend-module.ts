/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { ContainerModule } from 'inversify';
import { KeybindingContext, bindViewContribution, FrontendApplicationContribution } from "@theia/core/lib/browser";
import { FileNavigatorWidget, FILE_NAVIGATOR_ID } from "./navigator-widget";
import { NavigatorActiveContext } from './navigator-keybinding-context';
import { FileNavigatorContribution } from './navigator-contribution';
import { createFileNavigatorWidget } from "./navigator-container";
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { bindFileNavigatorPreferences } from './navigator-preferences';
import { FileNavigatorFilter } from './navigator-filter';
import { FuzzySearch } from './fuzzy-search';
import { SearchBox, SearchBoxProps, SearchBoxFactory } from './search-box';
import { SearchBoxDebounce } from './search-box-debounce';
import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bindFileNavigatorPreferences(bind);
    bind(FileNavigatorFilter).toSelf().inSingletonScope();

    bindViewContribution(bind, FileNavigatorContribution);
    bind(FrontendApplicationContribution).toService(FileNavigatorContribution);

    bind(KeybindingContext).to(NavigatorActiveContext).inSingletonScope();

    bind(FuzzySearch).toSelf().inSingletonScope();
    bind(SearchBoxFactory).toFactory(context =>
        (options: SearchBoxProps) => {
            const debounce = new SearchBoxDebounce(options);
            return new SearchBox(options, debounce);
        }
    );

    bind(FileNavigatorWidget).toDynamicValue(ctx =>
        createFileNavigatorWidget(ctx.container)
    );
    bind(WidgetFactory).toDynamicValue(context => ({
        id: FILE_NAVIGATOR_ID,
        createWidget: () => context.container.get<FileNavigatorWidget>(FileNavigatorWidget)
    }));
});
