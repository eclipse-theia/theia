/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { inject, injectable } from 'inversify';
import { MessageService } from '@theia/core/lib/common/message-service';
import { QuickOpenService, QuickOpenModel, QuickOpenItem, QuickOpenMode, QuickInputService } from '@theia/core/lib/browser/quick-open';
import { VariableRegistry, Variable } from './variable';

@injectable()
export class VariableQuickOpenService implements QuickOpenModel {

    protected items: QuickOpenItem[];

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    constructor(
        @inject(VariableRegistry) protected readonly variableRegistry: VariableRegistry,
        @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService
    ) { }

    open(): void {
        this.items = this.variableRegistry.getVariables().map(v => new QuickOpenItem({
            label: '${' + v.name + '}',
            detail: v.description,
            run: mode => {
                if (mode === QuickOpenMode.OPEN) {
                    setTimeout(() => this.showValue(v));
                    return true;
                }
                return false;
            }
        }));

        this.quickOpenService.open(this, {
            placeholder: 'Registered variables',
            fuzzyMatchLabel: true,
            fuzzyMatchDescription: true,
            fuzzySort: true
        });
    }

    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        acceptor(this.items);
    }

    protected async showValue(variable: Variable): Promise<void> {
        const argument = await this.quickInputService.open({
            placeHolder: 'Type a variable argument'
        });
        const value = await variable.resolve(undefined, argument);
        if (value) {
            this.messages.info(value);
        }
    }

}
