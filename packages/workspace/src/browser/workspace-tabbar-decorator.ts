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

import { injectable, inject } from '@theia/core/shared/inversify';
import { TabBarDecorator } from '@theia/core/lib/browser/shell/tab-bar-decorator';
import { WidgetDecoration } from '@theia/core/lib/browser/widget-decoration';
import { Title, Widget } from '@theia/core/lib/browser/widgets';
import { LabelProvider, ApplicationShell, NavigatableWidget } from '@theia/core/lib/browser';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { WorkspaceService } from './workspace-service';

@injectable()
export class WorkspaceTabBarDecorator implements TabBarDecorator {

    readonly id = 'theia-workspace-tabbar-decorator';

    protected readonly emitter = new Emitter<void>();

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    decorate(title: Title<Widget>): WidgetDecoration.Data[] {
        if (this.workspaceService.isMultiRootWorkspaceOpened) {
            const widget = title.owner;
            if (NavigatableWidget.is(widget)) {
                const resourceUri = widget.getResourceUri();
                const navigatableWidgets = this.getNavigatableWidgets();
                const duplicateExists = navigatableWidgets.some(w => this.isDuplicateTitleOpen(widget, w));
                if (!duplicateExists) {
                    return [];
                }
                const rootUri = this.workspaceService.getWorkspaceRootUri(resourceUri);
                if (rootUri) {
                    const rootName = this.labelProvider.getName(rootUri);
                    return [{
                        captionPrefixes: [
                            {
                                data: rootName
                            }
                        ]
                    }];
                }
            }
        }
        return [];
    }

    get onDidChangeDecorations(): Event<void> {
        return this.emitter.event;
    }

    protected fireDidChangeDecorations(): void {
        this.emitter.fire(undefined);
    }

    protected getNavigatableWidgets(): NavigatableWidget[] {
        const navigatableWidgets: NavigatableWidget[] = [];
        const widgets = this.shell.widgets.filter(w => w.isVisible);
        for (const widget of widgets) {
            if (NavigatableWidget.is(widget)) {
                navigatableWidgets.push(widget);
            }
        }
        return navigatableWidgets;
    }

    protected isDuplicateTitleOpen(a: NavigatableWidget, b: NavigatableWidget): boolean {
        return a.title.label === b.title.label;
    }

}
