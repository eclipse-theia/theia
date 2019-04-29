/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import URI from '@theia/core/lib/common/uri';

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
    processOptions(options: object): Promise<object>;
}
