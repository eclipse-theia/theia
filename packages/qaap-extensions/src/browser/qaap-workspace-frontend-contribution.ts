// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { FileDialogTreeFilters } from '@theia/filesystem/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { injectable } from '@theia/core/shared/inversify';
import { WorkspaceFrontendContribution } from '@theia/workspace/lib/browser';
import { THEIA_EXT } from '@theia/workspace/lib/common';

@injectable()
export class QaapWorkspaceFrontendContribution extends WorkspaceFrontendContribution {

    protected override getWorkspaceDialogFileFilters(): FileDialogTreeFilters {
        const filters: FileDialogTreeFilters = {};
        const appName = FrontendApplicationConfigProvider.get().applicationName;
        for (const fileType of this.workspaceFileService.getWorkspaceFileTypes()) {
            const displayName = fileType.extension === THEIA_EXT ? appName : fileType.name;
            filters[`${nls.localizeByDefault('{0} workspace', displayName)} (*.${fileType.extension})`] = [fileType.extension];
        }
        return filters;
    }
}
