/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from "@theia/core/lib/common/uri";
import { LabelProviderContribution, LabelProvider } from '@theia/core/lib/browser/label-provider';
import { injectable, inject } from "inversify";

export namespace DiffUris {

    export function encode(left: URI, right: URI, name?: string): URI {
        const diffUris = [
            left.toString(),
            right.toString()
        ];

        const diffUriStr = JSON.stringify(diffUris);

        return new URI(name || left.displayName).withScheme('diff').withQuery(diffUriStr);
    }

    export function decode(uri: URI): URI[] {
        if (uri.scheme !== 'diff') {
            throw ('URI must have scheme "diff".');
        }
        const diffUris: string[] = JSON.parse(uri.query);
        return diffUris.map(s => new URI(s));
    }

    export function isDiffUri(uri: URI): boolean {
        return uri.scheme === 'diff';
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
        const [left, right] = DiffUris.decode(uri);
        const leftLongName = this.labelProvider.getLongName(left);
        const rightLongName = this.labelProvider.getLongName(right);
        if (leftLongName === rightLongName) {
            return leftLongName;
        }
        return `${leftLongName} <-> ${rightLongName}`;
    }

    getName(uri: URI): string {
        const [left, right] = DiffUris.decode(uri);

        if (left.path.toString() === right.path.toString() && left.query && right.query) {
            return `${left.displayName}: ${left.query} <-> ${right.query}`;
        } else {
            const leftLongName = this.labelProvider.getName(left);
            const rightLongName = this.labelProvider.getName(right);
            if (leftLongName === rightLongName) {
                return leftLongName;
            }
            return `${leftLongName} <-> ${rightLongName}`;
        }
    }

    getIcon(uri: URI): string {
        return `fa fa-columns`;
    }
}
