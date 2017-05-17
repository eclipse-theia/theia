/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { bindContributionProvider } from '../../application/common/contribution-provider';
import { ContainerModule, } from "inversify";
import { FrontendApplicationContribution } from "../../application/browser";
import { WebSocketConnectionProvider } from "../../messaging/browser";
import { Window, ConsoleWindow, LanguagesService, LANGUAGES_PATH, CommandService } from '../common';
import { DefaultLanguageClientProvider, LanguageClientProvider } from './language-client-provider';
import { LanguagesPlugin } from "./languages-plugin";
import { LanguageClientLauncher } from './language-client-launcher';
import { CompositeLanguageClientContribution, LanguageClientContribution } from "./language-client-contribution";

export const browserLanguagesModule = new ContainerModule(bind => {
    bind(Window).to(ConsoleWindow).inSingletonScope();
    bind(CommandService).toSelf().inSingletonScope();

    bind(CompositeLanguageClientContribution).toSelf().inSingletonScope();
    bindContributionProvider(bind, LanguageClientContribution)

    bind(DefaultLanguageClientProvider).toSelf().inSingletonScope();
    bind(LanguageClientProvider).toProvider(context =>
        identifier => context.container.get(DefaultLanguageClientProvider).get(identifier)
    );
    bind(LanguageClientLauncher).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).to(LanguagesPlugin).inSingletonScope();

    bind<LanguagesService>(LanguagesService).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<LanguagesService>(LANGUAGES_PATH);
    }).inSingletonScope();
});
