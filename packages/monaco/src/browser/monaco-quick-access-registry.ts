/********************************************************************************
 * Copyright (c) 2021 Red Hat and others.
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

import { KeybindingRegistry, QuickPickItem, QuickPickSeparator } from '@theia/core/lib/browser';
import { QuickAccessProviderDescriptor, QuickAccessRegistry } from '@theia/core/lib/browser/quick-input/quick-access';
import { CancellationToken, Disposable } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MonacoQuickPickItem } from './monaco-quick-input-service';
import { IPickerQuickAccessProviderOptions, PickerQuickAccessProvider, Picks, Pick } from 'monaco-editor-core/esm/vs/platform/quickinput/browser/pickerQuickAccess';
import {
    IQuickAccessProvider,
    IQuickAccessProviderDescriptor,
    IQuickAccessProviderHelp,
    IQuickAccessRegistry
} from 'monaco-editor-core/esm/vs/platform/quickinput/common/quickAccess';

abstract class MonacoPickerAccessProvider extends PickerQuickAccessProvider<QuickPickItem> {
    constructor(prefix: string, options?: IPickerQuickAccessProviderOptions<QuickPickItem>) {
        super(prefix, options);
    }

    abstract getDescriptor(): QuickAccessProviderDescriptor;
}

class TheiaQuickAccessDescriptor implements IQuickAccessProviderDescriptor {
    constructor(
        public readonly theiaDescriptor: QuickAccessProviderDescriptor,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        readonly ctor: { new(...services: any /* TS BrandedService but no clue how to type this properly */[]): IQuickAccessProvider },
        readonly prefix: string,
        readonly helpEntries: IQuickAccessProviderHelp[],
        readonly placeholder?: string) { }
}

@injectable()
export class MonacoQuickAccessRegistry implements QuickAccessRegistry {
    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;

    private get monacoRegistry(): IQuickAccessRegistry {
        return platform.Registry.as<IQuickAccessRegistry>('workbench.contributions.quickaccess');
    }

    registerQuickAccessProvider(descriptor: QuickAccessProviderDescriptor): Disposable {
        const toMonacoPick = (item: QuickPickItem): Pick<IAnythingQuickPickItem> => {
            if (QuickPickSeparator.is(item)) {
                return item;
            } else {
                return new MonacoQuickPickItem(item, this.keybindingRegistry);
            }
        };

        const inner =
            class extends MonacoPickerAccessProvider {
                getDescriptor(): QuickAccessProviderDescriptor {
                    return descriptor;
                }
                constructor() {
                    super(descriptor.prefix);
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                getPicks(filter: string, disposables: any, token: CancellationToken): Picks<QuickPickItem> | Promise<Picks<QuickPickItem>> {
                    const result = descriptor.getInstance().getPicks(filter, token);
                    if (result instanceof Promise) {
                        return result.then(picks => picks.map(toMonacoPick));
                    } else {
                        return result.map(toMonacoPick);
                    }
                }
            };

        return this.monacoRegistry.registerQuickAccessProvider(new TheiaQuickAccessDescriptor(
            descriptor,
            inner,
            descriptor.prefix,
            descriptor.helpEntries,
            descriptor.placeholder
        ));
    }

    getQuickAccessProviders(): QuickAccessProviderDescriptor[] {
        return this.monacoRegistry.getQuickAccessProviders()
            .filter(provider => provider instanceof TheiaQuickAccessDescriptor)
            .map(provider => (provider as TheiaQuickAccessDescriptor).theiaDescriptor);
    }
    getQuickAccessProvider(prefix: string): QuickAccessProviderDescriptor | undefined {
        const monacoDescriptor = this.monacoRegistry.getQuickAccessProvider(prefix);
        return monacoDescriptor ? (monacoDescriptor as TheiaQuickAccessDescriptor).theiaDescriptor : undefined;
    }
    clear(): void {
        this.monacoRegistry.clear();
    }
}
