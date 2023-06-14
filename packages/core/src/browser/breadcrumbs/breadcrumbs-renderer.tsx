// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import * as React from 'react';
import { injectable, inject, postConstruct } from 'inversify';
import { ReactRenderer } from '../widgets';
import { BreadcrumbsService } from './breadcrumbs-service';
import { BreadcrumbRenderer } from './breadcrumb-renderer';
import PerfectScrollbar from 'perfect-scrollbar';
import URI from '../../common/uri';
import { Emitter, Event } from '../../common';
import { BreadcrumbPopupContainer } from './breadcrumb-popup-container';
import { CorePreferences } from '../core-preferences';
import { Breadcrumb, Styles } from './breadcrumbs-constants';
import { LabelProvider } from '../label-provider';

interface Cancelable {
    canceled: boolean;
}

@injectable()
export class BreadcrumbsRenderer extends ReactRenderer {

    @inject(BreadcrumbsService)
    protected readonly breadcrumbsService: BreadcrumbsService;

    @inject(BreadcrumbRenderer)
    protected readonly breadcrumbRenderer: BreadcrumbRenderer;

    @inject(CorePreferences)
    protected readonly corePreferences: CorePreferences;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    protected readonly onDidChangeActiveStateEmitter = new Emitter<boolean>();
    get onDidChangeActiveState(): Event<boolean> {
        return this.onDidChangeActiveStateEmitter.event;
    }

    protected uri: URI | undefined;
    protected breadcrumbs: Breadcrumb[] = [];
    protected popup: BreadcrumbPopupContainer | undefined;
    protected scrollbar: PerfectScrollbar | undefined;

    get active(): boolean {
        return !!this.breadcrumbs.length;
    }

    protected get breadCrumbsContainer(): Element | undefined {
        return this.host.firstElementChild ?? undefined;
    }

    protected refreshCancellationMarker: Cancelable = { canceled: true };

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.onDidChangeActiveStateEmitter);
        this.toDispose.push(this.breadcrumbsService.onDidChangeBreadcrumbs(uri => {
            if (this.uri?.isEqual(uri)) {
                this.refresh(this.uri);
            }
        }));
        this.toDispose.push(this.corePreferences.onPreferenceChanged(change => {
            if (change.preferenceName === 'breadcrumbs.enabled') {
                this.refresh(this.uri);
            }
        }));
        this.toDispose.push(this.labelProvider.onDidChange(() => this.refresh(this.uri)));
    }

    override dispose(): void {
        super.dispose();
        this.toDispose.dispose();
        if (this.popup) { this.popup.dispose(); }
        if (this.scrollbar) {
            this.scrollbar.destroy();
            this.scrollbar = undefined;
        }
    }

    async refresh(uri?: URI): Promise<void> {
        this.uri = uri;
        this.refreshCancellationMarker.canceled = true;
        const currentCallCanceled = { canceled: false };
        this.refreshCancellationMarker = currentCallCanceled;
        let breadcrumbs: Breadcrumb[];
        if (uri && this.corePreferences['breadcrumbs.enabled']) {
            breadcrumbs = await this.breadcrumbsService.getBreadcrumbs(uri);
        } else {
            breadcrumbs = [];
        }
        if (currentCallCanceled.canceled) {
            return;
        }

        const wasActive = this.active;
        this.breadcrumbs = breadcrumbs;
        const isActive = this.active;
        if (wasActive !== isActive) {
            this.onDidChangeActiveStateEmitter.fire(isActive);
        }

        this.update();
    }

    protected update(): void {
        this.render();

        if (!this.scrollbar) {
            this.createScrollbar();
        } else {
            this.scrollbar.update();
        }
        this.scrollToEnd();
    }

    protected createScrollbar(): void {
        const { breadCrumbsContainer } = this;
        if (breadCrumbsContainer) {
            this.scrollbar = new PerfectScrollbar(breadCrumbsContainer, {
                handlers: ['drag-thumb', 'keyboard', 'wheel', 'touch'],
                useBothWheelAxes: true,
                scrollXMarginOffset: 4,
                suppressScrollY: true
            });
        }
    }

    protected scrollToEnd(): void {
        const { breadCrumbsContainer } = this;
        if (breadCrumbsContainer) {
            breadCrumbsContainer.scrollLeft = breadCrumbsContainer.scrollWidth;
        }
    }

    protected override doRender(): React.ReactNode {
        return <ul className={Styles.BREADCRUMBS}>{this.renderBreadcrumbs()}</ul>;
    }

    protected renderBreadcrumbs(): React.ReactNode {
        return this.breadcrumbs.map(breadcrumb => this.breadcrumbRenderer.render(breadcrumb, this.togglePopup));
    }

    protected togglePopup = (breadcrumb: Breadcrumb, event: React.MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        let openPopup = true;
        if (this.popup?.isOpen) {
            this.popup.dispose();

            // There is a popup open. If the popup is the popup that belongs to the currently clicked breadcrumb
            // just close the popup. If another breadcrumb was clicked, open the new popup immediately.
            openPopup = this.popup.breadcrumbId !== breadcrumb.id;
        } else {
            this.popup = undefined;
        }
        if (openPopup) {
            const { currentTarget } = event;
            const breadcrumbElement = currentTarget.closest(`.${Styles.BREADCRUMB_ITEM}`);
            if (breadcrumbElement) {
                const { left: x, bottom: y } = breadcrumbElement.getBoundingClientRect();
                this.breadcrumbsService.openPopup(breadcrumb, { x, y }).then(popup => { this.popup = popup; });
            }
        }
    };
}

export const BreadcrumbsRendererFactory = Symbol('BreadcrumbsRendererFactory');
export interface BreadcrumbsRendererFactory {
    (): BreadcrumbsRenderer;
}
