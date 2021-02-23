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

import { interfaces } from '@theia/core/shared/inversify';
import { ProcessTaskContribution } from './process-task-contribution';
import { ProcessTaskResolver } from './process-task-resolver';
import { TaskContribution } from '../task-contribution';

export function bindProcessTaskModule(bind: interfaces.Bind): void {

    bind(ProcessTaskResolver).toSelf().inSingletonScope();
    bind(ProcessTaskContribution).toSelf().inSingletonScope();
    bind(TaskContribution).toService(ProcessTaskContribution);
}
