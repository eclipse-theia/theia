// *****************************************************************************
// Copyright (C) 2019 Arm and others.
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
import { EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';

/**
 * @deprecated since 1.75.0 - superseded by the SCM history graph in `@theia/scm`
 * and the Timeline view in `@theia/timeline`. This package will be removed in a
 * future release - see https://github.com/eclipse-theia/theia/issues/17457.
 */
export const EDITOR_CONTEXT_MENU_SCM = [...EDITOR_CONTEXT_MENU, '3_scm'];
