// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { TaskConfiguration } from '../common';
import { Task } from './task';

export const TaskRunner = Symbol('TaskRunner');
/**
 * A {@link TaskRunner} knows how to run a task configuration of a particular type.
 */
export interface TaskRunner {
    /**
     * Runs a task based on the given `TaskConfiguration`.
     * @param taskConfig the task configuration that should be executed.
     * @param ctx the execution context.
     *
     * @returns a promise of the (currently running) {@link Task}.
     */
    run(tskConfig: TaskConfiguration, ctx?: string): Promise<Task>;
}
