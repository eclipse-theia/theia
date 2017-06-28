/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container } from 'inversify';
import { FrontendApplication, frontendApplicationModule } from 'theia-core/lib/application/browser';
import { messagingFrontendModule } from 'theia-core/lib/messaging/browser';
import { loggerFrontendModule } from 'theia-core/lib/application/browser';

import frontend_1 from 'theia-core/lib/application/browser/menu/browser-menu-module';
import frontend_2 from 'theia-core/lib/application/browser/clipboard/browser-clipboard-module';
import frontend_3 from 'theia-core/lib/filesystem/browser/filesystem-frontend-module';
import frontend_4 from 'theia-core/lib/workspace/browser/workspace-frontend-module';
import frontend_5 from 'theia-core/lib/navigator/browser/navigator-frontend-module';
import frontend_6 from 'theia-core/lib/editor/browser/editor-frontend-module';
import frontend_7 from 'theia-core/lib/monaco/browser/monaco-frontend-module';
import frontend_8 from 'theia-core/lib/terminal/browser/terminal-frontend-module';
import frontend_9 from 'theia-core/lib/languages/browser/languages-frontend-module';
import frontend_10 from 'theia-core/lib/java/browser/java-frontend-module';
import frontend_11 from 'theia-core/lib/python/browser/python-frontend-module';
import frontend_12 from 'theia-core/lib/cpp/browser/cpp-frontend-module';

const container = new Container();
container.load(frontendApplicationModule);
container.load(messagingFrontendModule);
container.load(loggerFrontendModule);

container.load(frontend_1);
container.load(frontend_2);
container.load(frontend_3);
container.load(frontend_4);
container.load(frontend_5);
container.load(frontend_6);
container.load(frontend_7);
container.load(frontend_8);
container.load(frontend_9);
container.load(frontend_10);
container.load(frontend_11);
container.load(frontend_12);

const application = container.get(FrontendApplication);
application.start();