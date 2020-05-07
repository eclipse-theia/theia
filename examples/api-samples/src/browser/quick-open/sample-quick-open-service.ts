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
import { inject, injectable, interfaces } from 'inversify';
import { CommandContribution, CommandRegistry, Command } from '@theia/core/lib/common/command';
import { QuickOpenItem, QuickOpenModel, QuickOpenGroupItem } from '@theia/core/lib/common/quick-open-model';
import {
    QuickOpenService,
    QuickOpenOptions,
    QuickOpenItemOptions,
    QuickOpenContribution,
    QuickOpenActionProvider,
    QuickOpenHandlerRegistry,
    QuickOpenGroupItemOptions
} from '@theia/core/lib/browser/quick-open';

@injectable()
export class SampleQuickOpenService implements QuickOpenContribution, QuickOpenModel, CommandContribution, Command {

    readonly description = 'Sample Quick Open';
    readonly id = 'open:sample-quick-open';
    readonly label = this.description;

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    registerQuickOpenHandlers(registry: QuickOpenHandlerRegistry): void {
        registry.registerHandler({ ...this, prefix: '' });
    }

    getModel(): QuickOpenModel {
        return this;
    }

    getOptions(): QuickOpenOptions {
        return {
            fuzzyMatchLabel: {
                enableSeparateSubstringMatching: true
            }
        };
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(this, { execute: () => this.quickOpenService.open(this, this.getOptions()) });
    }

    protected readonly data = new Map<string, string[]>([
        ['main', ['Main 1', 'Main 2', 'Main 3']],
        ['secondary', ['Secondary 1', 'Secondary 2', 'Secondary 3']],
        ['rest', ['B', 'A', 'AA', 'AAA', 'AAAA']]
    ]);

    onType(
        lookFor: string,
        acceptor: (items: QuickOpenItem<QuickOpenItemOptions>[], actionProvider?: QuickOpenActionProvider) => void): void {

        const toAccept: QuickOpenItem<QuickOpenItemOptions>[] = [];
        for (const [groupLabel, items] of this.data.entries()) {
            toAccept.push(...items.map((item, i) => {
                let group: QuickOpenGroupItemOptions | undefined = undefined;
                if (i === 0) {
                    group = { groupLabel, showBorder: toAccept.length > 0 };
                }
                return this.toQuickItem(item, group);
            }));
        }
        acceptor(toAccept);
    }

    protected toQuickItem(label: string, group?: QuickOpenGroupItemOptions): QuickOpenItem<QuickOpenItemOptions> {
        const options = {
            label,
            description: `balbla - ${label}`
        };
        if (group) {
            return new QuickOpenGroupItem<QuickOpenGroupItemOptions>({ ...options, ...group });
        } else {
            return new QuickOpenItem<QuickOpenItemOptions>(options);
        }
    }

}

export const bindSampleQuickOpenService = (bind: interfaces.Bind) => {
    bind(SampleQuickOpenService).toSelf().inSingletonScope();
    bind(CommandContribution).toService(SampleQuickOpenService);
    bind(QuickOpenContribution).toService(SampleQuickOpenService);
};
