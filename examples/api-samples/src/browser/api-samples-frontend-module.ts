/********************************************************************************
 * Copyright (C) 2019 Arm and others.
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

import { ContainerModule } from 'inversify';
import { CommandContribution } from '@theia/core';
import { LabelProviderContribution } from '@theia/core/lib/browser/label-provider';
import { ApiSamplesContribution } from './api-samples-contribution';
import { SampleDynamicLabelProviderContribution } from './sample-dynamic-label-provider-contribution';

export default new ContainerModule(bind => {
    bind(CommandContribution).to(ApiSamplesContribution).inSingletonScope();

    bind(SampleDynamicLabelProviderContribution).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(SampleDynamicLabelProviderContribution);
});
