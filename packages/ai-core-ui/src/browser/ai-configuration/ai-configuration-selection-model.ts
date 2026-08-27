// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { Emitter, Event } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { AiConfigurationSelection } from './ai-configuration-category';

/**
 * Shared selection bus for the AI Configuration view. The tree, the detail host,
 * and renderers navigate through this single model instead of talking directly
 * to each other.
 */
@injectable()
export class AiConfigurationSelectionModel {

    protected selection: AiConfigurationSelection | undefined;

    protected readonly onDidChangeSelectionEmitter = new Emitter<AiConfigurationSelection | undefined>();
    readonly onDidChangeSelection: Event<AiConfigurationSelection | undefined> = this.onDidChangeSelectionEmitter.event;

    getSelection(): AiConfigurationSelection | undefined {
        return this.selection;
    }

    select(selection: AiConfigurationSelection | undefined): void {
        this.selection = selection;
        this.onDidChangeSelectionEmitter.fire(selection);
    }
}
