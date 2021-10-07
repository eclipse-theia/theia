/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { Uri } from '@theia/core';
import { injectable, inject } from '@theia/core/shared/inversify';
import { URI } from '@theia/core/shared/vscode-uri';
import { MiniBrowserEnvironment } from '@theia/mini-browser/lib/browser/environment/mini-browser-environment';

@injectable()
export class PreviewLinkNormalizer {

    protected urlScheme = new RegExp('^[a-z][a-z|0-9|\+|\-|\.]*:', 'i');

    @inject(MiniBrowserEnvironment)
    protected readonly miniBrowserEnvironment: MiniBrowserEnvironment;

    normalizeLink(documentUri: URI, link: string): string {
        try {
            if (!this.urlScheme.test(link)) {
                const location = Uri.joinPath(Uri.dirname(documentUri), link).path;
                return Uri.joinPath(this.miniBrowserEnvironment.getEndpoint('normalized-link').getRestUrl(), location).toString();
            }
        } catch {
            // ignore
        }
        return link;
    }
}
