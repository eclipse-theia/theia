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

import { ContributionProvider, Prioritizeable } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { EmptyPropertyViewWidgetProvider } from './empty-property-view-widget-provider';
import { PropertyViewWidgetProvider } from './property-view-widget-provider';

/**
 * `PropertyViewService` provides an access to existing property view widget providers.
 */
@injectable()
export class PropertyViewService {

    @inject(ContributionProvider) @named(PropertyViewWidgetProvider)
    private readonly contributions: ContributionProvider<PropertyViewWidgetProvider>;

    @inject(EmptyPropertyViewWidgetProvider)
    private readonly emptyWidgetProvider: EmptyPropertyViewWidgetProvider;

    private providers: PropertyViewWidgetProvider[] = [];

    @postConstruct()
    init(): void {
        this.providers = this.providers.concat(this.contributions.getContributions());
    }

    /**
     * Return a property view widget provider with the highest priority for the given selection.
     * Never reject, return DefaultProvider ('No properties available') if no other matches.
     */
    async getProvider(selection: Object | undefined): Promise<PropertyViewWidgetProvider> {
        const provider = await this.prioritize(selection);
        return provider ?? this.emptyWidgetProvider;
    }

    protected async prioritize(selection: Object | undefined): Promise<PropertyViewWidgetProvider | undefined> {
        const prioritized = await Prioritizeable.prioritizeAll(this.providers, async (provider: PropertyViewWidgetProvider) => {
            try {
                return await provider.canHandle(selection);
            } catch {
                return 0;
            }
        });
        return prioritized.length !== 0 ? prioritized[0].value : undefined;
    }

}
