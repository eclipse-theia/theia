// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { codicon, ViewContainer } from '@theia/core/lib/browser';
import { nls } from '@theia/core';

@injectable()
export class PluginSearchWidget extends ViewContainer {

    static ID = 'plugin-search-widget';
    static LABEL = nls.localizeByDefault('Extensions');

    @postConstruct()
    protected override init(): void {
        super.init();
        this.id = PluginSearchWidget.ID;
        this.addClass('theia-vsx-extensions-view-container');
        this.setTitleOptions({
            label: PluginSearchWidget.LABEL,
            iconClass: codicon('extensions'),
            closeable: true
        });
    }
}
