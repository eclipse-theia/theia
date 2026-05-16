// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceTrustDialog } from './workspace-trust-dialog';

export const WorkspaceTrustDialogFactory = Symbol('WorkspaceTrustDialogFactory');
export interface WorkspaceTrustDialogFactory {
    create(folderUris: URI[]): WorkspaceTrustDialog;
}

@injectable()
export class DefaultWorkspaceTrustDialogFactory implements WorkspaceTrustDialogFactory {
    create(folderUris: URI[]): WorkspaceTrustDialog {
        return new WorkspaceTrustDialog(folderUris);
    }
}
