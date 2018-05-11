/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { KeybindingContext, bindViewContribution } from "@theia/core/lib/browser";
import { FileNavigatorWidget, FILE_NAVIGATOR_ID } from "./navigator-widget";
import { NavigatorActiveContext } from './navigator-keybinding-context';
import { FileNavigatorContribution } from './navigator-contribution';
import { createFileNavigatorWidget } from "./navigator-container";
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { bindFileNavigatorPreferences } from './navigator-preferences';
import { FileNavigatorFilter } from './navigator-filter';
import { FuzzySearch } from './fuzzy-search';
import { SearchBox, SearchBoxProps, SearchBoxFactory } from './search-box';
import { SearchBoxDebounce, SearchBoxDebounceOptions } from './search-box-debounce';
import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bindFileNavigatorPreferences(bind);
    bind(FileNavigatorFilter).toSelf().inSingletonScope();

    bindViewContribution(bind, FileNavigatorContribution);

    bind(KeybindingContext).to(NavigatorActiveContext).inSingletonScope();

    bind(FuzzySearch).toSelf().inSingletonScope();
    bind(SearchBoxDebounceOptions).toConstantValue(SearchBoxDebounceOptions.DEFAULT);
    bind(SearchBoxDebounce).toSelf();
    bind(SearchBox).toSelf();
    bind(SearchBoxFactory).toFactory(context =>
        (props: SearchBoxProps) => {
            const { container } = context;
            const { delay } = props;
            container.bind(SearchBoxDebounceOptions).toConstantValue({ delay });
            container.bind(SearchBoxProps).toConstantValue(props);
            return container.get(SearchBox);
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
