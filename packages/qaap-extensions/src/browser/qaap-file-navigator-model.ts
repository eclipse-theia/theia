// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { TreeNode } from '@theia/core/lib/browser';
import { SelectableTreeNode } from '@theia/core/lib/browser/tree/tree-selection';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { collapseLeftPanelIfMobileOneColumn } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { FileNode } from '@theia/filesystem/lib/browser/file-tree';
import { FileNavigatorModel } from '@theia/navigator/lib/browser/navigator-model';

@injectable()
export class QaapFileNavigatorModel extends FileNavigatorModel {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    override previewNode(node: TreeNode): void {
        super.previewNode(node);
        if (FileNode.is(node)) {
            this.collapseLeftExplorerSheetIfMobile();
        }
    }

    /** Narrow mobile: one tap opens the file in the editor (not preview) and closes the explorer sheet. */
    openFileOnMobileSingleTap(node: TreeNode): void {
        if (!FileNode.is(node)) {
            return;
        }
        if (SelectableTreeNode.is(node)) {
            this.selectNode(node);
        }
        this.doOpenNode(node);
        this.collapseLeftExplorerSheetIfMobile();
    }

    protected override doOpenNode(node: TreeNode): void {
        super.doOpenNode(node);
        if (FileNode.is(node)) {
            this.collapseLeftExplorerSheetIfMobile();
        }
    }

    protected collapseLeftExplorerSheetIfMobile(): void {
        collapseLeftPanelIfMobileOneColumn(this.shell);
    }
}
