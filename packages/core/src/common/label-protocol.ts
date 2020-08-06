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

// copied and modified from https://github.com/microsoft/vscode/blob/1.44.2/src/vs/platform/label/common/label.ts#L35-L49
/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
export interface ResourceLabelFormatter {
    scheme: string;
    authority?: string;
    priority?: boolean;
    formatting: ResourceLabelFormatting;
}

export interface ResourceLabelFormatting {
    label: string; // myLabel:/${path}
    separator: '/' | '\\' | '';
    tildify?: boolean;
    normalizeDriveLetter?: boolean;
    authorityPrefix?: string;
}
