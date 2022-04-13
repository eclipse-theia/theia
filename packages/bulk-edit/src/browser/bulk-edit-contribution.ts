// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { Widget } from '@theia/core/lib/browser/widgets/widget';
import { CommandRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { BulkEditCommands } from './bulk-edit-commands';
import { MonacoBulkEditService } from '@theia/monaco/lib/browser/monaco-bulk-edit-service';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { BulkEditTreeWidget, BULK_EDIT_TREE_WIDGET_ID, BULK_EDIT_WIDGET_NAME } from './bulk-edit-tree';
import { QuickViewService } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { ResourceEdit } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/bulkEditService';

@injectable()
export class BulkEditContribution extends AbstractViewContribution<BulkEditTreeWidget> implements TabBarToolbarContribution {
    private edits: ResourceEdit[];

    @inject(QuickViewService) @optional()
    protected override readonly quickView: QuickViewService;

    constructor(private readonly bulkEditService: MonacoBulkEditService) {
        super({
            widgetId: BULK_EDIT_TREE_WIDGET_ID,
            widgetName: BULK_EDIT_WIDGET_NAME,
            defaultWidgetOptions: {
                area: 'bottom'
            }
        });
        this.bulkEditService.setPreviewHandler((edits: ResourceEdit[]) => this.previewEdit(edits));
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        this.quickView?.hideItem(BULK_EDIT_WIDGET_NAME);

        registry.registerCommand(BulkEditCommands.APPLY, {
            isEnabled: widget => this.withWidget(widget, () => true),
            isVisible: widget => this.withWidget(widget, () => true),
            execute: widget => this.withWidget(widget, () => this.apply())
        });
        registry.registerCommand(BulkEditCommands.DISCARD, {
            isEnabled: widget => this.withWidget(widget, () => true),
            isVisible: widget => this.withWidget(widget, () => true),
            execute: widget => this.withWidget(widget, () => this.discard())
        });
    }

    async registerToolbarItems(toolbarRegistry: TabBarToolbarRegistry): Promise<void> {
        toolbarRegistry.registerItem({
            id: BulkEditCommands.APPLY.id,
            command: BulkEditCommands.APPLY.id,
            tooltip: nls.localizeByDefault('Apply Refactoring'),
            priority: 0,
        });
        toolbarRegistry.registerItem({
            id: BulkEditCommands.DISCARD.id,
            command: BulkEditCommands.DISCARD.id,
            tooltip: nls.localizeByDefault('Discard Refactoring'),
            priority: 1,
        });
    }

    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), cb: (bulkEdit: BulkEditTreeWidget) => T): T | false {
        if (widget instanceof BulkEditTreeWidget) {
            return cb(widget);
        }
        return false;
    }

    private async previewEdit(edits: ResourceEdit[]): Promise<ResourceEdit[]> {
        const widget = await this.openView({ activate: true });

        if (widget) {
            this.edits = edits;
            await widget.initModel(edits);
        }

        return edits;
    }

    private apply(): void {
        if (this.edits) {
            this.edits.forEach(edit => {
                if (edit.metadata) {
                    edit.metadata.needsConfirmation = false;
                }
            });
            this.bulkEditService.apply(this.edits);
        }
        this.closeView();
    }

    private discard(): void {
        this.edits = [];
        this.closeView();
    }
}
