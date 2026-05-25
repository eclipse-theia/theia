// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceTrustDialog } from '@theia/workspace/lib/browser/workspace-trust-dialog';
import { WorkspaceTrustDialogFactory } from '@theia/workspace/lib/browser/workspace-trust-dialog-factory';
import { QaapWorkspaceTrustDialog } from './qaap-workspace-trust-dialog';

@injectable()
export class QaapWorkspaceTrustDialogFactory implements WorkspaceTrustDialogFactory {
    create(folderUris: URI[]): WorkspaceTrustDialog {
        return new QaapWorkspaceTrustDialog(folderUris);
    }
}
