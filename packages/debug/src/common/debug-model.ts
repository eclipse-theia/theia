/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Some entities copied and modified from https://github.com/Microsoft/vscode/blob/master/src/vs/vscode.d.ts

/**
 * Configuration for a debug session.
 */
export interface DebugConfiguration {
    /**
     * The type of the debug session.
     */
    type: string;

    /**
     * The name of the debug session.
     */
    name: string;

    /**
     * Additional debug type specific properties.
     */
    [key: string]: any;
}
