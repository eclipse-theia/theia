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

import { Widget } from '@theia/core/lib/browser/widgets/widget';
import { PropertyDataService } from './property-data-service';

/**
 * A widget that fetches the property data via the given {@link PropertyDataService} and the given selection
 * and renders that property data.
 * This widget can be provided by a registered `PropertyViewWidgetProvider`.
 */
export interface PropertyViewContentWidget extends Widget {
    updatePropertyViewContent(propertyDataService?: PropertyDataService, selection?: Object): void;
}
