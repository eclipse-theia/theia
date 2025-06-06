// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { codicon, Message, onDomEvent, ReactWidget } from '@theia/core/lib/browser';
import { LabelParser } from '@theia/core/lib/browser/label-parser';

@injectable()
export class MergeEditorPaneHeader extends ReactWidget {

    @inject(LabelParser)
    protected readonly labelParser: LabelParser;

    private _description = '';
    get description(): string {
        return this._description;
    }
    set description(description: string) {
        this._description = description;
        this.update();
    }

    private _detail = '';
    get detail(): string {
        return this._detail;
    }
    set detail(detail: string) {
        this._detail = detail;
        this.update();
    }

    private _toolbarItems: readonly MergeEditorPaneToolbarItem[];
    get toolbarItems(): readonly MergeEditorPaneToolbarItem[] {
        return this._toolbarItems;
    }
    set toolbarItems(toolbarItems: readonly MergeEditorPaneToolbarItem[]) {
        this._toolbarItems = toolbarItems;
        this.update();
    }

    @postConstruct()
    protected init(): void {
        this.addClass('header');
        this.scrollOptions = undefined;
        this.node.tabIndex = -1;
        this.toDispose.push(onDomEvent(this.node, 'click', () => this.activate()));
        this.title.changed.connect(this.update, this);
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.parent?.activate();
    }

    protected override render(): React.ReactNode {
        return (
            <React.Fragment>
                <span className='title'>{this.renderWithIcons(this.title.label)}</span>
                <span className='description'>{this.renderWithIcons(this.description)}</span>
                <span className='detail'>{this.renderWithIcons(this.detail)}</span>
                <span className='toolbar' onClick={this.handleToolbarClick}>{this.toolbarItems.map(toolbarItem => this.renderToolbarItem(toolbarItem))}</span>
            </React.Fragment>
        );
    }

    private readonly handleToolbarClick = (event: React.MouseEvent) => event.nativeEvent.stopImmediatePropagation();

    protected renderWithIcons(text: string): React.ReactNode[] {
        const result: React.ReactNode[] = [];
        const labelParts = this.labelParser.parse(text);
        labelParts.forEach((labelPart, index) => {
            if (typeof labelPart === 'string') {
                result.push(labelPart);
            } else {
                result.push(<span key={index} className={codicon(labelPart.name)}></span>);
            }
        });
        return result;
    }

    protected renderToolbarItem({ id, label, tooltip, className, onClick }: MergeEditorPaneToolbarItem): React.ReactNode {
        return <span key={id} title={tooltip} onClick={onClick} className={className}>{label}</span>;
    }
}

export interface MergeEditorPaneToolbarItem {
    readonly id: string;
    readonly label?: string;
    readonly tooltip?: string;
    readonly className?: string;
    readonly onClick?: (event: React.MouseEvent) => void;
}
