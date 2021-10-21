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

import { nls } from '@theia/core/lib/common/nls';
import { codicon } from '@theia/core/lib/browser';
import { Command } from '@theia/core/lib/common';

export namespace VSXExtensionsCommands {

    const EXTENSIONS_CATEGORY_KEY = 'vscode/settingsLayout/extensions';
    const EXTENSIONS_CATEGORY = 'Extensions';

    export const CLEAR_ALL = Command.toLocalizedCommand({
        id: 'vsxExtensions.clearAll',
        category: EXTENSIONS_CATEGORY,
        label: 'Clear Search Results',
        iconClass: codicon('clear-all')
    }, 'vscode/search.contribution/ClearSearchResultsAction.label', EXTENSIONS_CATEGORY_KEY);
    export const INSTALL_FROM_VSIX: Command & { dialogLabel: string } = {
        id: 'vsxExtensions.installFromVSIX',
        category: nls.localize(EXTENSIONS_CATEGORY_KEY, EXTENSIONS_CATEGORY),
        originalCategory: EXTENSIONS_CATEGORY,
        originalLabel: 'Install from VSIX...',
        label: nls.localize('theia/vsx-registry/installFromVSIX', 'Install from VSIX') + '...',
        dialogLabel: nls.localize('theia/vsx-registry/installFromVSIX', 'Install from VSIX')
    };
    export const COPY: Command = {
        id: 'vsxExtensions.copy'
    };
    export const COPY_EXTENSION_ID: Command = {
        id: 'vsxExtensions.copyExtensionId'
    };
    export const SHOW_BUILTINS = Command.toLocalizedCommand({
        id: 'vsxExtension.showBuiltins',
        label: 'Show Built-in Extensions',
        category: EXTENSIONS_CATEGORY,
    }, 'vscode/extensions.contribution/showBuiltInExtensions', EXTENSIONS_CATEGORY_KEY);
    export const SHOW_INSTALLED = Command.toLocalizedCommand({
        id: 'vsxExtension.showInstalled',
        label: 'Show Installed Extensions',
        category: EXTENSIONS_CATEGORY,
    }, 'vscode/extensions.contribution/showInstalledExtensions', EXTENSIONS_CATEGORY_KEY);
    export const SHOW_RECOMMENDATIONS = Command.toLocalizedCommand({
        id: 'vsxExtension.showRecommendations',
        label: 'Show Recommended Extensions',
        category: EXTENSIONS_CATEGORY,
    }, 'vscode/extensions.contribution/showRecommendedExtensions', EXTENSIONS_CATEGORY_KEY);
}
