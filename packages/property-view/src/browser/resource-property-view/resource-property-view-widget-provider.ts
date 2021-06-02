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

import { Navigatable } from '@theia/core/lib/browser';
import { FileSelection } from '@theia/filesystem/lib/browser/file-selection';
import { inject, injectable } from '@theia/core/shared/inversify';
import { DefaultPropertyViewWidgetProvider } from '../property-view-widget-provider';
import { ResourcePropertyViewTreeWidget } from './resource-property-view-tree-widget';

@injectable()
export class ResourcePropertyViewWidgetProvider extends DefaultPropertyViewWidgetProvider {

    @inject(ResourcePropertyViewTreeWidget) protected treeWidget: ResourcePropertyViewTreeWidget;

    readonly id = 'resources';
    readonly label = 'ResourcePropertyViewWidgetProvider';

    canHandle(selection: Object | undefined): number {
        return (this.isFileSelection(selection) || this.isNavigatableSelection(selection)) ? 1 : 0;
    }

    protected isFileSelection(selection: Object | undefined): boolean {
        return !!selection && Array.isArray(selection) && FileSelection.is(selection[0]);
    }

    protected isNavigatableSelection(selection: Object | undefined): boolean {
        return !!selection && Navigatable.is(selection);
    }

    provideWidget(selection: Object | undefined): Promise<ResourcePropertyViewTreeWidget> {
        return Promise.resolve(this.treeWidget);
    }

    updateContentWidget(selection: Object | undefined): void {
        this.getPropertyDataService(selection).then(service => this.treeWidget.updatePropertyViewContent(service, selection));
    }

}
