/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
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

import { LabelServiceMain } from '../../common/plugin-api-rpc';
import { interfaces } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { DefaultUriLabelProviderContribution, LabelProviderContribution } from '@theia/core/lib/browser';
import { ContributionProvider } from '@theia/core/lib/common';
import { ResourceLabelFormatter } from '@theia/core/lib/common/label-protocol';

export class LabelServiceMainImpl implements LabelServiceMain {
    private readonly resourceLabelFormatters = new Map<number, Disposable>();
    private readonly contributionProvider: ContributionProvider<LabelProviderContribution>;

    constructor(container: interfaces.Container) {
        this.contributionProvider = container.getNamed(ContributionProvider, LabelProviderContribution);
    }

    $registerResourceLabelFormatter(handle: number, formatter: ResourceLabelFormatter): void {
        // Dynamically registered formatters should have priority over those contributed via package.json
        formatter.priority = true;
        const disposables: DisposableCollection = new DisposableCollection();
        for (const contribution of this.contributionProvider.getContributions()) {
            if (contribution instanceof DefaultUriLabelProviderContribution) {
                disposables.push(contribution.registerFormatter(formatter));
            }
        }
        this.resourceLabelFormatters.set(handle, disposables);
    }

    $unregisterResourceLabelFormatter(handle: number): void {
        const toDispose = this.resourceLabelFormatters.get(handle);
        if (toDispose) {
            toDispose.dispose();
        }
        this.resourceLabelFormatters.delete(handle);
    }
}
