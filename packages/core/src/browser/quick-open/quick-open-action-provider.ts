/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { Disposable } from '../../common/disposable';
import { injectable } from 'inversify';
import { QuickOpenItem } from './quick-open-model';

export interface QuickOpenActionProvider {
    hasActions(item: QuickOpenItem): boolean;
    getActions(item: QuickOpenItem): Promise<QuickOpenAction[]>;
}

export interface QuickOpenActionOptions {
    id: string;
    label?: string;
    tooltip?: string;
    class?: string | undefined;
    enabled?: boolean;
    checked?: boolean;
    radio?: boolean;
}

export interface QuickOpenAction extends QuickOpenActionOptions, Disposable {
    run(item?: QuickOpenItem): PromiseLike<void>;
}

@injectable()
export abstract class QuickOpenBaseAction implements QuickOpenAction {
    constructor(protected options: QuickOpenActionOptions) {
    }

    get id(): string {
        return this.options.id;
    }

    get label(): string {
        return this.options.label || '';
    }

    set label(value: string) {
        this.options.label = value;
    }

    get tooltip(): string {
        return this.options.tooltip || '';
    }

    set tooltip(value: string) {
        this.options.tooltip = value;
    }

    get class(): string | undefined {
        return this.options.class || '';
    }

    set class(value: string | undefined) {
        this.options.class = value;
    }

    get enabled(): boolean {
        return this.options.enabled || true;
    }

    set enabled(value: boolean) {
        this.options.enabled = value;
    }

    get checked(): boolean {
        return this.options.checked || false;
    }

    set checked(value: boolean) {
        this.options.checked = value;
    }

    get radio(): boolean {
        return this.options.radio || false;
    }

    set radio(value: boolean) {
        this.options.radio = value;
    }

    abstract run(item?: QuickOpenItem): PromiseLike<void>;

    dispose(): void { }
}
