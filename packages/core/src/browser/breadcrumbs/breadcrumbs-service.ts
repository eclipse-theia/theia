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

import { inject, injectable, named, postConstruct } from 'inversify';
import { ContributionProvider, Prioritizeable, Emitter, Event } from '../../common';
import URI from '../../common/uri';
import { Coordinate } from '../context-menu-renderer';
import { BreadcrumbPopupContainer, BreadcrumbPopupContainerFactory } from './breadcrumb-popup-container';
import { BreadcrumbsContribution, Styles, Breadcrumb } from './breadcrumbs-constants';

@injectable()
export class BreadcrumbsService {

    @inject(ContributionProvider) @named(BreadcrumbsContribution)
    protected readonly contributions: ContributionProvider<BreadcrumbsContribution>;

    @inject(BreadcrumbPopupContainerFactory) protected readonly breadcrumbPopupContainerFactory: BreadcrumbPopupContainerFactory;

    protected hasSubscribed = false;

    protected popupsOverlayContainer: HTMLDivElement;

    protected readonly onDidChangeBreadcrumbsEmitter = new Emitter<URI>();

    @postConstruct()
    init(): void {
        this.createOverlayContainer();
    }

    protected createOverlayContainer(): void {
        this.popupsOverlayContainer = window.document.createElement('div');
        this.popupsOverlayContainer.id = Styles.BREADCRUMB_POPUP_OVERLAY_CONTAINER;
        if (window.document.body) {
            window.document.body.appendChild(this.popupsOverlayContainer);
        }
    }

    /**
     * Subscribe to this event emitter to be notified when the breadcrumbs have changed.
     * The URI is the URI of the editor the breadcrumbs have changed for.
     */
    get onDidChangeBreadcrumbs(): Event<URI> {
        // This lazy subscription is to address problems in inversify's instantiation routine
        // related to use of the IconThemeService by different components instantiated by the
        // ContributionProvider.
        if (!this.hasSubscribed) {
            this.subscribeToContributions();
        }
        return this.onDidChangeBreadcrumbsEmitter.event;
    }

    /**
     * Subscribes to the onDidChangeBreadcrumbs events for all contributions.
     */
    protected subscribeToContributions(): void {
        this.hasSubscribed = true;
        for (const contribution of this.contributions.getContributions()) {
            contribution.onDidChangeBreadcrumbs(uri => this.onDidChangeBreadcrumbsEmitter.fire(uri));
        }
    }

    /**
     * Returns the breadcrumbs for a given URI, possibly an empty list.
     */
    async getBreadcrumbs(uri: URI): Promise<Breadcrumb[]> {
        const result: Breadcrumb[] = [];
        for (const contribution of await this.prioritizedContributions()) {
            result.push(...await contribution.computeBreadcrumbs(uri));
        }
        return result;
    }

    protected async prioritizedContributions(): Promise<BreadcrumbsContribution[]> {
        const prioritized = await Prioritizeable.prioritizeAll(
            this.contributions.getContributions(), contribution => contribution.priority);
        return prioritized.map(p => p.value).reverse();
    }

    /**
     * Opens a popup for the given breadcrumb at the given position.
     */
    async openPopup(breadcrumb: Breadcrumb, position: Coordinate): Promise<BreadcrumbPopupContainer | undefined> {
        const contribution = this.contributions.getContributions().find(c => c.type === breadcrumb.type);
        if (contribution) {
            const popup = this.breadcrumbPopupContainerFactory(this.popupsOverlayContainer, breadcrumb.id, position);
            const popupContent = await contribution.attachPopupContent(breadcrumb, popup.container);
            if (popupContent && popup.isOpen) {
                popup.onDidDispose(() => popupContent.dispose());
            } else {
                popupContent?.dispose();
            }
            return popup;
        }
    }
}
