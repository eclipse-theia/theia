/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { Command } from '@theia/core/lib/common';

export namespace VSXExtensionsCommands {

    const EXTENSIONS_CATEGORY = 'Extensions';

    export const CLEAR_ALL: Command = {
        id: 'vsxExtensions.clearAll',
        category: EXTENSIONS_CATEGORY,
        label: 'Clear Search Results',
        iconClass: 'clear-all'
    };
    export const INSTALL_FROM_VSIX: Command & { dialogLabel: string } = {
        id: 'vsxExtensions.installFromVSIX',
        category: EXTENSIONS_CATEGORY,
        label: 'Install from VSIX...',
        dialogLabel: 'Install from VSIX'
    };
    export const COPY: Command = {
        id: 'vsxExtensions.copy'
    };
    export const COPY_EXTENSION_ID: Command = {
        id: 'vsxExtensions.copyExtensionId'
    };
    export const SHOW_BUILTINS: Command = {
        id: 'vsxExtension.showBuiltins',
        label: 'Show Built-in Extensions',
        category: EXTENSIONS_CATEGORY,
    };
    export const SHOW_INSTALLED: Command = {
        id: 'vsxExtension.showInstalled',
        label: 'Show Installed Extensions',
        category: EXTENSIONS_CATEGORY,
    };
    export const SHOW_RECOMMENDATIONS: Command = {
        id: 'vsxExtension.showRecommendations',
        label: 'Show Recommended Extensions',
        category: EXTENSIONS_CATEGORY,
    };
}
