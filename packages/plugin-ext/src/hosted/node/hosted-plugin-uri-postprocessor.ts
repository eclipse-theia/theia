/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from "@theia/core/lib/common/uri";

// We export symbol name instead of symbol itself here because we need to provide
// a contribution point to which any extensions could contribute.
// In case of just symbols, symbol inside an extension won't be the same as here
// even if the extension imports this module.
// To solve this problem we should provide global symbol. So right way to use the contribution point is:
// ...
// bind(Symbol.for(HostedPluginUriPostProcessorSymbolName)).to(AContribution);
// ...
export const HostedPluginUriPostProcessorSymbolName = 'HostedPluginUriPostProcessor';

export interface HostedPluginUriPostProcessor {
    processUri(uri: URI): Promise<URI>;
}
