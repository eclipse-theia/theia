/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject, postConstruct } from 'inversify';
import { Panel, Widget } from '@phosphor/widgets';
import { MenuModelRegistry } from '@theia/core/lib/common/menu';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { ViewContextKeyService } from './view-context-key-service';
import { StatefulWidget } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { Message } from '@phosphor/messaging';
import { TreeViewWidget } from './tree-view-widget';
import { DescriptionWidget } from '@theia/core/lib/browser/shell/description-widget';
import { Title } from '@theia/core/lib/browser';

@injectable()
export class PluginViewWidgetIdentifier {
    id: string;
    viewId: string;
}

@injectable()
export class PluginViewWidget extends Panel implements StatefulWidget, DescriptionWidget {

    @inject(MenuModelRegistry)
    protected readonly menus: MenuModelRegistry;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ViewContextKeyService)
    protected readonly contextKeys: ViewContextKeyService;

    @inject(PluginViewWidgetIdentifier)
    readonly options: PluginViewWidgetIdentifier;

    constructor() {
        super();
        this.node.tabIndex = -1;
        this.node.style.height = '100%';

        this.description = new Title<Widget>({} as Title.IOptions<Widget>);
    }

    @postConstruct()
    protected init(): void {
        this.id = this.options.id;
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const widget = this.widgets[0];
        if (widget) {
            widget.activate();
            this.updateWidgetMessage();
        } else {
            this.node.focus();
        }
    }

    storeState(): PluginViewWidget.State {
        return {
            label: this.title.label,
            message: this.message,
            widgets: this.widgets
        };
    }

    restoreState(state: PluginViewWidget.State): void {
        this.title.label = state.label;
        this.message = state.message;
        for (const widget of state.widgets) {
            this.addWidget(widget);
        }
    }

    protected _suppressUpdateViewVisibility = false;
    set suppressUpdateViewVisibility(suppressUpdateViewVisibility: boolean) {
        this._suppressUpdateViewVisibility = !this.updatingViewVisibility && suppressUpdateViewVisibility;
    }

    protected updatingViewVisibility = false;
    updateViewVisibility(cb: () => void): void {
        if (this._suppressUpdateViewVisibility) {
            return;
        }
        try {
            this.updatingViewVisibility = true;
            cb();
        } finally {
            this.updatingViewVisibility = false;
        }
    }

    private _message: string | undefined;
    get message(): string | undefined {
        return this._message;
    }

    set message(message: string | undefined) {
        this._message = message;
        this.updateWidgetMessage();
    }

    private _description: Title<Widget>;
    get description(): Title<Widget> {
        return this._description;
    }

    set description(description: Title<Widget>) {
        this._description = description;
        this.updateWidgetDescription();
    }

    private updateWidgetMessage(): void {
        const widget = this.widgets[0];
        if (widget) {
            if (widget instanceof TreeViewWidget) {
                widget.message = this._message;
            }
        }
    }

    private updateWidgetDescription(): void {
        const widget = this.widgets[0];
        if (widget) {
            if (DescriptionWidget.is(widget)) {
                widget.description = this._description;
            }
        }
    }

    addWidget(widget: Widget): void {
        super.addWidget(widget);
        this.updateWidgetMessage();
        this.updateWidgetDescription();
    }

    insertWidget(index: number, widget: Widget): void {
        super.insertWidget(index, widget);
        this.updateWidgetMessage();
        this.updateWidgetDescription();
    }
}
export namespace PluginViewWidget {
    export interface State {
        label: string
        message?: string;
        widgets: ReadonlyArray<Widget>
    }
}
