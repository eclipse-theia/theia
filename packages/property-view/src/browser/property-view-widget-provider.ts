/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
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

import { ContributionProvider, MaybePromise, Prioritizeable } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { PropertyDataService } from './property-data-service';
import { PropertyViewContentWidget } from './property-view-content-widget';

export const PropertyViewWidgetProvider = Symbol('PropertyViewWidgetProvider');
export interface PropertyViewWidgetProvider {
    /**
     * A unique id for this provider.
     */
    id: string;
    /**
     * A human-readable name for this provider.
     */
    label?: string;

    /**
     * Test whether this provider can provide a widget for the given selection.
     * A returned value indicating a priority of this provider.
     *
     * @param selection the global selection object
     * @returns a nonzero number if this provider can provide; otherwise it cannot; never reject
     */
    canHandle(selection: Object | undefined): MaybePromise<number>;

    /**
     * Provide a widget for the given selection.
     * Never reject if `canHandle` return a positive number; otherwise should reject.
     *
     * @param selection the global selection object
     * @returns a resolved property view content widget.
     */
    provideWidget(selection: Object | undefined): Promise<PropertyViewContentWidget>;

    /**
     * Update the widget with the given selection.
     * Never reject if `canHandle` return a positive number; otherwise should reject.
     *
     * @param selection the global selection object
     * @returns a resolved property view content widget.
     */
    updateContentWidget(selection: Object | undefined): void;

}
/**
 * `DefaultPropertyViewWidgetProvider` should be extended to provide a new content property view widget for the given selection.
 */
@injectable()
export abstract class DefaultPropertyViewWidgetProvider implements PropertyViewWidgetProvider {

    @inject(ContributionProvider) @named(PropertyDataService)
    protected readonly contributions: ContributionProvider<PropertyDataService>;

    protected propertyDataServices: PropertyDataService[] = [];

    id = 'default';
    label = 'DefaultPropertyViewWidgetProvider';

    @postConstruct()
    init(): void {
        this.propertyDataServices = this.propertyDataServices.concat(this.contributions.getContributions());
    }

    canHandle(selection: Object | undefined): MaybePromise<number> {
        return 0;
    }

    provideWidget(selection: Object | undefined): Promise<PropertyViewContentWidget> {
        throw new Error('not implemented');
    }

    updateContentWidget(selection: Object | undefined): void {
        // no-op
    }

    protected async getPropertyDataService(selection: Object | undefined): Promise<PropertyDataService> {
        const dataService = await this.prioritize(selection);
        return dataService ?? this.propertyDataServices[0];
    }

    protected async prioritize(selection: Object | undefined): Promise<PropertyDataService | undefined> {
        const prioritized = await Prioritizeable.prioritizeAll(this.propertyDataServices, async (service: PropertyDataService) => {
            try {
                return service.canHandleSelection(selection);
            } catch {
                return 0;
            }
        });
        return prioritized.length !== 0 ? prioritized[0].value : undefined;
    }
}
