/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import * as React from '@theia/core/shared/react';
import { injectable, postConstruct, inject } from '@theia/core/shared/inversify';
import { ReactWidget, Message } from '@theia/core/lib/browser/widgets';
import { VSXExtensionsSearchModel } from './vsx-extensions-search-model';

@injectable()
export class VSXExtensionsSearchBar extends ReactWidget {

    @inject(VSXExtensionsSearchModel)
    protected readonly model: VSXExtensionsSearchModel;

    @postConstruct()
    protected init(): void {
        this.id = 'vsx-extensions-search-bar';
        this.addClass('theia-vsx-extensions-search-bar');
        this.model.onDidChangeQuery(() => this.update());
    }

    protected input: HTMLInputElement | undefined;

    protected render(): React.ReactNode {
        return <input type='text'
            ref={input => this.input = input || undefined}
            value={this.model.query}
            className='theia-input'
            placeholder='Search Extensions in Open VSX Registry'
            onChange={this.updateQuery}>
        </input>;
    }

    protected updateQuery = (e: React.ChangeEvent<HTMLInputElement>) => this.model.query = e.target.value;

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        if (this.input) {
            this.input.focus();
        }
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

}
