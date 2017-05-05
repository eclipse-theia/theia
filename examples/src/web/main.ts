/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container } from "inversify";

import * as main from '../main';
import { browserClipboardModule } from 'theia/lib/application/browser/clipboard/clipboard-module';
import { browserMenuModule } from "theia/lib/application/browser/menu/menu-module";

// Create the browser specific container.
const container = new Container();
container.load(browserMenuModule);
container.load(browserClipboardModule);

// Invoke common main with the browser specific bindings.
main.start(container);