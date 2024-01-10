// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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
/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
// copied and modified from https://github.com/microsoft/vscode/blob/a4a4cf5ace4472bc4f5176396bb290cafa15c518/src/vs/workbench/contrib/webviewView/browser/webviewViewService.ts

import { CancellationToken, Event } from '@theia/core/lib/common';
import { WebviewWidget } from '../webview/webview';

export interface WebviewView {
    title?: string;
    description?: string;
    badge?: number | undefined;
    badgeTooltip?: string | undefined;
    readonly webview: WebviewWidget;
    readonly onDidChangeVisibility: Event<boolean>;
    readonly onDidDispose: Event<void>;
    readonly onDidChangeBadge: Event<void>;
    readonly onDidChangeBadgeTooltip: Event<void>;

    dispose(): void;
    show(preserveFocus: boolean): void;
    resolve(): Promise<void>;
}

export interface WebviewViewResolver {
    resolve(webviewView: WebviewView, cancellation: CancellationToken): Promise<void>;
}
