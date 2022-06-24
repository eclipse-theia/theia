// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from 'inversify';
import URI from '../common/uri';
import { LabelProviderContribution, LabelProvider, DidChangeLabelEvent } from './label-provider';
import { codicon } from './widgets';

export namespace DiffUris {

    export const DIFF_SCHEME = 'diff';

    export function encode(left: URI, right: URI, label?: string): URI {
        const diffUris = [
            left.toString(),
            right.toString()
        ];

        const diffUriStr = JSON.stringify(diffUris);

        return new URI().withScheme(DIFF_SCHEME).withPath(label || '').withQuery(diffUriStr);
    }

    export function decode(uri: URI): URI[] {
        if (uri.scheme !== DIFF_SCHEME) {
            throw new Error((`The URI must have scheme "diff". The URI was: ${uri}.`));
        }
        const diffUris: string[] = JSON.parse(uri.query);
        return diffUris.map(s => new URI(s));
    }

    export function isDiffUri(uri: URI): boolean {
        return uri.scheme === DIFF_SCHEME;
    }

}

@injectable()
export class DiffUriLabelProviderContribution implements LabelProviderContribution {

    constructor(@inject(LabelProvider) protected labelProvider: LabelProvider) { }

    canHandle(element: object): number {
        if (element instanceof URI && DiffUris.isDiffUri(element)) {
            return 20;
        }
        return 0;
    }

    getLongName(uri: URI): string {
        const label = uri.path.toString();
        if (label) {
            return label;
        }
        const [left, right] = DiffUris.decode(uri);
        const leftLongName = this.labelProvider.getLongName(left);
        const rightLongName = this.labelProvider.getLongName(right);
        if (leftLongName === rightLongName) {
            return leftLongName;
        }
        return `${leftLongName} ⟷ ${rightLongName}`;
    }

    getName(uri: URI): string {
        const label = uri.path.toString();
        if (label) {
            return label;
        }
        const [left, right] = DiffUris.decode(uri);

        if (left.path.toString() === right.path.toString() && left.query && right.query) {
            const prefix = left.displayName ? `${left.displayName}: ` : '';
            return `${prefix}${left.query} ⟷ ${right.query}`;
        } else {
            let title;
            if (uri.displayName && left.path.toString() !== right.path.toString() && left.displayName !== uri.displayName) {
                title = `${uri.displayName}: `;
            } else {
                title = '';
            }

            const leftLongName = this.labelProvider.getName(left);
            const rightLongName = this.labelProvider.getName(right);
            if (leftLongName === rightLongName) {
                return leftLongName;
            }
            return `${title}${leftLongName} ⟷ ${rightLongName}`;
        }
    }

    getIcon(uri: URI): string {
        return codicon('split-horizontal');
    }

    affects(diffUri: URI, event: DidChangeLabelEvent): boolean {
        for (const uri of DiffUris.decode(diffUri)) {
            if (event.affects(uri)) {
                return true;
            }
        }
        return false;
    }

}
