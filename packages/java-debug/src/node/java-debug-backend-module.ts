/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
import { JavaExtensionContribution } from '@theia/java/lib/node';
import { JavaDebugAdapterContribution, JavaDebugExtensionContribution } from './java-debug-adapter-contribution';
import { DebugAdapterContribution } from '@theia/debug/lib/common/debug-model';

export default new ContainerModule(bind => {
    /* explcit inTransientScope because it is very important, that
       each web socket connection gets its own instance,
       since it is using frontend services via this connection */
    bind(DebugAdapterContribution).to(JavaDebugAdapterContribution).inTransientScope();
    bind(JavaExtensionContribution).to(JavaDebugExtensionContribution).inSingletonScope();
});
