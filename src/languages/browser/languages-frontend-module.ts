/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, } from "inversify";
import { bindContributionProvider } from '../../application/common';
import { FrontendApplicationContribution } from "../../application/browser";
import { Window, ConsoleWindow, Commands, DefaultCommands } from '../common';
import { LanguageClientFactory } from './language-client-factory';
import { LanguagesFrontendContribution } from './languages-frontend-contribution';
import { LanguageClientContribution } from "./language-client-contribution";

export default new ContainerModule(bind => {
    bind(Window).to(ConsoleWindow).inSingletonScope();
    bind(Commands).to(DefaultCommands).inSingletonScope();

    bind(LanguageClientFactory).toSelf().inSingletonScope();

    bindContributionProvider(bind, LanguageClientContribution);
    bind(FrontendApplicationContribution).to(LanguagesFrontendContribution);
});
