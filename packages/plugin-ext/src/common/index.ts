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

// Exports contribution point for uri postprocessor of hosted plugin manager.
// This could be used to alter hosted instance uri, for example, change port.
export * from '../hosted/node/hosted-plugin-uri-postprocessor';

// Here we expose types from @theia/plugin, so it becames a direct dependency
export * from '../common/plugin-protocol';
export * from '../plugin/plugin-context';
export * from '../api/plugin-api';
