/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ResourceResolver, Resource } from "@theia/core";
import URI from "@theia/core/lib/common/uri";
import { injectable } from "inversify";
import { Schemes } from "../../../common/uri-components";
import { UriComponents } from "../../../common/uri-components";

const resources = new Map<string, UntitledResource>();
let index = 0;
@injectable()
export class UntitledResourceResolver implements ResourceResolver {
    resolve(uri: URI): Resource | Promise<Resource> {
        if (uri.scheme === Schemes.Untitled) {
            return resources.get(uri.toString())!;
        }
        throw new Error(`scheme ${uri.scheme} is not '${Schemes.Untitled}'`);
    }
}

export class UntitledResource implements Resource {

    constructor(public uri: URI, private content?: string) {
        resources.set(this.uri.toString(), this);
    }

    readContents(options?: { encoding?: string | undefined; } | undefined): Promise<string> {
        return Promise.resolve(this.content ? this.content : '');
    }

    dispose(): void {
        resources.delete(this.uri.toString());
    }
}

export function createUntitledResource(content?: string, language?: string): UriComponents {
    let extension;
    if (language) {
        for (const lang of monaco.languages.getLanguages()) {
            if (lang.id === language) {
                if (lang.extensions) {
                    extension = lang.extensions[0];
                    break;
                }
            }
        }
    }
    const resource = new UntitledResource(new URI().withScheme(Schemes.Untitled).withPath(`/Untitled-${index++}${extension ? extension : ''}`), content);
    return monaco.Uri.parse(resource.uri.toString());
}
