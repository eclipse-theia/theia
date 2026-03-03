// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Standalone factory to obtain a TheiaPluginScanner instance for generating list.json
 * (browser-only plugins). Reuses the same scanner as the backend so list.json gets
 * the same normalized model, lifecycle, and contributions.
 */

import { Container, ContainerModule } from '@theia/core/shared/inversify';
import { PluginScanner } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { TheiaPluginScanner } from '@theia/plugin-ext/lib/hosted/node/scanners/scanner-theia';
import { PluginUriFactory } from '@theia/plugin-ext/lib/hosted/node/scanners/plugin-uri-factory';
import { FilePluginUriFactory } from '@theia/plugin-ext/lib/hosted/node/scanners/file-plugin-uri-factory';
import { GrammarsReader } from '@theia/plugin-ext/lib/hosted/node/scanners/grammars-reader';

/**
 * Returns a TheiaPluginScanner instance with the same bindings as the hosted backend.
 */
export function createTheiaPluginScanner(): PluginScanner {
    const container = new Container();
    const theiaScannerModule = new ContainerModule(bind => {
        bind(GrammarsReader).toSelf().inSingletonScope();
        bind(PluginUriFactory).to(FilePluginUriFactory).inSingletonScope();
        bind(PluginScanner).to(TheiaPluginScanner).inSingletonScope();
    });

    container.load(theiaScannerModule);
    return container.get(PluginScanner) as PluginScanner;
}
