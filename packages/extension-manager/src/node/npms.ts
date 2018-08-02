/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import * as request from 'request';
import { NodePackage } from '@theia/application-package';

export function search(query: string, from?: number, size?: number): Promise<NodePackage[]> {
    return new Promise((resolve, reject) => {
        let url = 'https://api.npms.io/v2/search?q=' + encodeURIComponent(query);
        if (from) {
            url += '&from=' + from;
        }
        if (size) {
            url += '&size=' + size;
        }
        request(url, (error, response, body) => {
            if (error) {
                reject(error);
                // tslint:disable-next-line:no-magic-numbers
            } else if (response.statusCode === 200) {
                const result = JSON.parse(body) as {
                    results: {
                        package: NodePackage
                    }[]
                };
                resolve(result.results.map(v => v.package));
            } else {
                reject(new Error(`${response.statusCode}: ${response.statusMessage} for ${url}`));
            }
        });
    });
}
