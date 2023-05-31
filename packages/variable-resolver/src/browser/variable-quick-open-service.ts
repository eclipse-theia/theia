// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { MessageService } from '@theia/core/lib/common/message-service';
import { VariableRegistry, Variable } from './variable';
import { VariableResolverService } from './variable-resolver-service';
import { QuickPickItem, QuickInputService } from '@theia/core/lib/browser';

@injectable()
export class VariableQuickOpenService {

    protected items: Array<QuickPickItem>;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;

    @inject(VariableResolverService)
    protected readonly variableResolver: VariableResolverService;

    constructor(
        @inject(VariableRegistry) protected readonly variableRegistry: VariableRegistry
    ) { }

    open(): void {
        this.items = this.variableRegistry.getVariables().map(v => ({
            label: '${' + v.name + '}',
            detail: v.description,
            execute: () => {
                setTimeout(() => this.showValue(v));
            }
        }));

        this.quickInputService?.showQuickPick(this.items, { placeholder: 'Registered variables' });
    }

    protected async showValue(variable: Variable): Promise<void> {
        const argument = await this.quickInputService?.input({
            placeHolder: 'Type a variable argument'
        });
        const value = await this.variableResolver.resolve('${' + variable.name + ':' + argument + '}');
        if (typeof value === 'string') {
            this.messages.info(value);
        }
    }
}
