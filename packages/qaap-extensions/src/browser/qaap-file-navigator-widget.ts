// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { TreeNode } from '@theia/core/lib/browser';
import { matchesMobileNarrowViewport } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { FileNode } from '@theia/filesystem/lib/browser/file-tree';
import { FileNavigatorWidget } from '@theia/navigator/lib/browser/navigator-widget';
import { QaapFileNavigatorModel } from './qaap-file-navigator-model';

@injectable()
export class QaapFileNavigatorWidget extends FileNavigatorWidget {

    protected override tapNode(node?: TreeNode): void {
        if (node && matchesMobileNarrowViewport() && FileNode.is(node)) {
            (this.model as QaapFileNavigatorModel).openFileOnMobileSingleTap(node);
            return;
        }
        super.tapNode(node);
    }
}
