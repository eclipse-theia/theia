// *****************************************************************************
// Copyright (C) 2021 Red Hat and others.
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

import { KeybindingRegistry, QuickPickItem, QuickPickSeparator } from '@theia/core/lib/browser';
import { QuickAccessProviderDescriptor, QuickAccessRegistry } from '@theia/core/lib/browser/quick-input/quick-access';
import { CancellationToken, Disposable } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MonacoQuickPickItem } from './monaco-quick-input-service';
import {
    IPickerQuickAccessProviderOptions, PickerQuickAccessProvider, Picks, Pick, IPickerQuickAccessItem
} from '@theia/monaco-editor-core/esm/vs/platform/quickinput/browser/pickerQuickAccess';
import {
    Extensions,
    IQuickAccessProvider,
    IQuickAccessProviderDescriptor,
    IQuickAccessProviderHelp,
    IQuickAccessRegistry,
    QuickAccessRegistry as VSCodeQuickAccessRegistry,
} from '@theia/monaco-editor-core/esm/vs/platform/quickinput/common/quickAccess';
import { IQuickPickItem, IQuickPickItemWithResource } from '@theia/monaco-editor-core/esm/vs/platform/quickinput/common/quickInput';
import { Registry } from '@theia/monaco-editor-core/esm/vs/platform/registry/common/platform';

interface IAnythingQuickPickItem extends IPickerQuickAccessItem, IQuickPickItemWithResource { }

abstract class MonacoPickerAccessProvider extends PickerQuickAccessProvider<IQuickPickItem> {
    constructor(prefix: string, options?: IPickerQuickAccessProviderOptions<IQuickPickItem>) {
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
        return Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);
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

                protected override async _getPicks(filter: string, disposables: unknown, token: CancellationToken): Promise<Picks<IQuickPickItem>> {
                    const result = await Promise.resolve(descriptor.getInstance().getPicks(filter, token));
                    return result.map(toMonacoPick);
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
        if (this.monacoRegistry instanceof VSCodeQuickAccessRegistry) {
            this.monacoRegistry.clear();
        }
    }
}
