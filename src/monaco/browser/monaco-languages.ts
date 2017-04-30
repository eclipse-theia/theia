/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, decorate } from "inversify";
import { MonacoLanguages as BaseMonacoLanguages, ProtocolToMonacoConverter, MonacoToProtocolConverter } from "monaco-languageclient";
import { Languages } from "../../languages/common";

decorate(injectable(), BaseMonacoLanguages);
decorate(inject(ProtocolToMonacoConverter), BaseMonacoLanguages, 0);
decorate(inject(MonacoToProtocolConverter), BaseMonacoLanguages, 1);

@injectable()
export class MonacoLanguages extends BaseMonacoLanguages implements Languages {

    constructor(
        @inject(ProtocolToMonacoConverter) p2m: ProtocolToMonacoConverter,
        @inject(MonacoToProtocolConverter) m2p: MonacoToProtocolConverter) {
        super(p2m, m2p);
    }
}
