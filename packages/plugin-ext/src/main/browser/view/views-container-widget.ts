/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { ViewContainer, View } from '../../../common';
import { TreeViewWidget } from './tree-views-main';
import { Widget, COLLAPSED_CLASS, EXPANSION_TOGGLE_CLASS } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';

export function createElement(className?: string): HTMLDivElement {
    const div = document.createElement('div');
    if (className) {
        div.classList.add(className);
    }
    return div;
}

export class ViewsContainerWidget extends Widget {

    private sections: Map<string, ViewContainerSection> = new Map<string, ViewContainerSection>();
    private childrenId: string[] = [];

    constructor(protected viewContainer: ViewContainer, protected views: View[]) {
        super();

        this.id = `views-container-widget-${viewContainer.id}`;
        this.title.closable = true;
        this.title.caption = this.title.label = viewContainer.title;

        this.addClass('theia-views-container');

        views.forEach((view: View) => {
            if (this.hasView(view.id)) {
                return;
            }
            const section = new ViewContainerSection(view, () => {
                this.updateDimensions();
            });
            this.sections.set(view.id, section);
            this.node.appendChild(section.node);
        });
    }

    public hasView(viewId: string): boolean {
        return this.sections.has(viewId);
    }

    public addWidget(viewId: string, viewWidget: TreeViewWidget) {
        const section = this.sections.get(viewId);
        if (section && this.childrenId.indexOf(viewId) === -1) {
            section.addViewWidget(viewWidget);
            this.childrenId.push(viewId);
            this.updateDimensions();
        }
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.updateDimensions();
    }

    public updateDimensions() {
        let visibleSections = 0;
        let availableHeight = this.node.offsetHeight;
        // Determine available space for sections and how much sections are opened
        this.sections.forEach((section: ViewContainerSection) => {
            availableHeight -= section.header.offsetHeight;
            if (section.opened) {
                visibleSections++;
            }
        });
        // Do nothing if there is no opened sections
        if (visibleSections === 0) {
            return;
        }
        // Get section height
        const sectionHeight = availableHeight / visibleSections;
        // Update height of opened sections
        this.sections.forEach((section: ViewContainerSection) => {
            if (section.opened) {
                section.content.style.height = `${sectionHeight}px`;
                section.update();
            }
        });
    }

}

export class ViewContainerSection {
    node: HTMLDivElement;
    header: HTMLDivElement;
    control: HTMLDivElement;
    title: HTMLDivElement;
    content: HTMLDivElement;

    private viewWidget: TreeViewWidget;

    constructor(public view: View, private updateDimensionsCallback: Function) {
        this.node = createElement('theia-views-container-section');

        this.createTitle();
        this.createContent();
    }

    createTitle(): void {
        this.header = createElement('theia-views-container-section-title');
        this.node.appendChild(this.header);

        this.control = createElement(EXPANSION_TOGGLE_CLASS);
        this.header.appendChild(this.control);

        this.title = createElement('theia-views-container-section-label');
        this.title.innerText = this.view.name;
        this.header.appendChild(this.title);

        this.header.onclick = () => this.toggleOpen();
    }

    createContent(): void {
        this.content = createElement('theia-views-container-section-content');
        this.node.appendChild(this.content);

        this.content.innerHTML = `<div style='padding: 20px 0; text-align: center; '>${this.view.name}</div>`;
    }

    get opened(): boolean {
        return !this.control.classList.contains(COLLAPSED_CLASS);
    }

    protected toDisposeOnOpen = new DisposableCollection();
    toggleOpen(): void {
        this.control.classList.toggle(COLLAPSED_CLASS);
        if (this.opened) {
            this.toDisposeOnOpen.dispose();
        } else {
            const display = this.content.style.display;
            this.content.style.display = 'none';
            this.toDisposeOnOpen.push(Disposable.create(() => this.content.style.display = display));
        }
        this.updateDimensionsCallback();
        this.update();
    }

    addViewWidget(viewWidget: TreeViewWidget): void {
        this.content.innerHTML = '';

        this.viewWidget = viewWidget;
        Widget.attach(viewWidget, this.content);

        viewWidget.model.onChanged(() => {
            this.update();
        });
        this.update();
    }

    update(): void {
        if (this.opened && this.viewWidget) {
            this.viewWidget.updateWidget();
        }
    }
}
