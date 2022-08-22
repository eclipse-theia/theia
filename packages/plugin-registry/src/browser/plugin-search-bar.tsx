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

import { nls } from '@theia/core';
import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { BaseWidget, Message } from '@theia/core/src/browser';

@injectable()
export class PluginSearchBar extends BaseWidget {

    static ID = 'theia.plugin-search-bar';

    protected input: HTMLInputElement;

    @postConstruct()
    protected init(): void {
        this.id = PluginSearchBar.ID;
        this.addClass('theia-vsx-extensions-search-bar');
        this.input = document.createElement('input');
        this.input.addEventListener('change', event => this.handleInputChange(event));
        this.input.className = 'theia-input';
        this.input.placeholder = nls.localize('theia/plugin-registry/searchPlaceholder', 'Search Extensions');
        this.input.spellcheck = false;
        this.node.appendChild(this.input);
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.input.focus();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
    }

    protected handleInputChange(event: Event): void {
        const change = event.target as HTMLInputElement;
    }
}
