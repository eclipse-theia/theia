/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as request from "request";
import { NodePackage } from "generator-theia";

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
                reject(`${response.statusCode}: ${response.statusMessage}`);
            }
        });
    });
};