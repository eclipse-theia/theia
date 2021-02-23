/********************************************************************************
 * Copyright (C) 2019 Arm and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { DefaultUriLabelProviderContribution, DidChangeLabelEvent } from '@theia/core/lib/browser/label-provider';
import URI from '@theia/core/lib/common/uri';
import { Emitter, Event } from '@theia/core';

@injectable()
export class SampleDynamicLabelProviderContribution extends DefaultUriLabelProviderContribution {

    protected isActive: boolean = false;

    constructor() {
        super();
        const outer = this;

        setInterval(() => {
            if (this.isActive) {
                outer.x++;
                outer.fireLabelsDidChange();
            }
        }, 1000);
    }

    canHandle(element: object): number {
        if (element.toString().includes('test')) {
            return 30;
        }
        return 0;
    }

    toggle(): void {
        this.isActive = !this.isActive;
        this.fireLabelsDidChange();
    }

    private fireLabelsDidChange(): void {
        this.onDidChangeEmitter.fire({
            affects: (element: URI) => element.toString().includes('test')
        });
    }

    protected getUri(element: URI): URI {
        return new URI(element.toString());
    }

    getIcon(element: URI): string {
        const uri = this.getUri(element);
        const icon = super.getFileIcon(uri);
        if (!icon) {
            return this.defaultFileIcon;
        }
        return icon;
    }

    protected readonly onDidChangeEmitter = new Emitter<DidChangeLabelEvent>();
    private x: number = 0;

    getName(element: URI): string | undefined {
        const uri = this.getUri(element);
        if (this.isActive && uri.toString().includes('test')) {
            return super.getName(uri) + '-' + this.x.toString(10);
        } else {
            return super.getName(uri);
        }
    }

    getLongName(element: URI): string | undefined {
        const uri = this.getUri(element);
        return super.getLongName(uri);
    }

    get onDidChange(): Event<DidChangeLabelEvent> {
        return this.onDidChangeEmitter.event;
    }

}
