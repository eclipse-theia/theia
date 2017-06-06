/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, decorate, unmanaged } from "inversify";
import { Widget } from "@phosphor/widgets";

decorate(injectable(), Widget);
decorate(unmanaged(), Widget, 0);

export * from "@phosphor/widgets";
export * from "@phosphor/messaging";