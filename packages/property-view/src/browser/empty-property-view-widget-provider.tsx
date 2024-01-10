// *****************************************************************************
// Copyright (C) 2020 EclipseSource and others.
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

import { nls } from '@theia/core/lib/common/nls';
import { ReactWidget } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { PropertyViewContentWidget } from './property-view-content-widget';
import { DefaultPropertyViewWidgetProvider } from './property-view-widget-provider';

/**
 * Property view widget that is shown if no property data or selection is available.
 * This widget is provided by the {@link EmptyPropertyViewWidgetProvider}.
 */
class EmptyPropertyViewWidget extends ReactWidget implements PropertyViewContentWidget {

    static readonly ID = 'theia-empty-property-view';
    static readonly LABEL = 'No Properties';

    constructor() {
        super();
        this.id = EmptyPropertyViewWidget.ID;
        this.title.label = EmptyPropertyViewWidget.LABEL;
        this.title.caption = EmptyPropertyViewWidget.LABEL;
        this.title.closable = false;
        this.node.tabIndex = 0;
    }

    updatePropertyViewContent(): void {
        this.update();
    }

    protected render(): React.ReactNode {
        return this.emptyComponent;
    }

    protected emptyComponent: JSX.Element = <div className={'theia-widget-noInfo'}>{nls.localize('theia/property-view/noProperties', 'No properties available.')}</div>;

}

/**
 * `EmptyPropertyViewWidgetProvider` is implemented to provide the {@link EmptyPropertyViewWidget}
 *  if the given selection is undefined or no other provider can handle the given selection.
 */
@injectable()
export class EmptyPropertyViewWidgetProvider extends DefaultPropertyViewWidgetProvider {

    static readonly ID = 'no-properties';
    override readonly id = EmptyPropertyViewWidgetProvider.ID;
    override readonly label = 'DefaultPropertyViewWidgetProvider';

    private emptyWidget: EmptyPropertyViewWidget;

    constructor() {
        super();
        this.emptyWidget = new EmptyPropertyViewWidget();
    }

    override canHandle(selection: Object | undefined): number {
        return selection === undefined ? 1 : 0;
    }

    override provideWidget(selection: Object | undefined): Promise<EmptyPropertyViewWidget> {
        return Promise.resolve(this.emptyWidget);
    }

    override updateContentWidget(selection: Object | undefined): void {
        this.emptyWidget.updatePropertyViewContent();
    }
}
