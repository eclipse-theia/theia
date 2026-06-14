// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { TreeElementNode } from '@theia/core/lib/browser/source-tree';
import { collapseLeftPanelIfMobileOneColumn } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { VSXExtension } from '@theia/vsx-registry/lib/browser/vsx-extension';
import { VSXExtensionsWidget } from '@theia/vsx-registry/lib/browser/vsx-extensions-widget';

/**
 * On narrow one-column layout, collapse the left sheet when the user opens an extension
 * from the marketplace list. Does not replace {@link VSXExtensionsWidget} factory.
 */
@injectable()
export class QaapVsxExtensionsMobileContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    private readonly attached = new WeakSet<VSXExtensionsWidget>();

    onStart(): void {
        this.widgetManager.onDidCreateWidget(({ widget }) => {
            if (widget instanceof VSXExtensionsWidget) {
                this.attachMobileDismiss(widget);
            }
        });
    }

    onDidInitializeLayout(_app: FrontendApplication): void {
        for (const widget of this.widgetManager.getWidgets(VSXExtensionsWidget.ID)) {
            if (widget instanceof VSXExtensionsWidget) {
                this.attachMobileDismiss(widget);
            }
        }
    }

    protected attachMobileDismiss(widget: VSXExtensionsWidget): void {
        if (this.attached.has(widget)) {
            return;
        }
        this.attached.add(widget);
        const subscription = widget.model.onOpenNode(node => {
            if (TreeElementNode.is(node) && node.element instanceof VSXExtension) {
                collapseLeftPanelIfMobileOneColumn(this.shell);
            }
        });
        widget.disposed.connect(() => subscription.dispose());
    }
}
