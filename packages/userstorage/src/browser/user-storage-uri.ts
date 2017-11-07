/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from '@theia/core/lib/common/uri';

export namespace UserStorageUri {

    export const SCHEME = 'user_storage';

    /**
     * Creates a new file URI from the filesystem path argument.
     * @param fsPath the filesystem path.
     */
    export function create(fsPath: string) {
        const fsUri = new URI(fsPath);
        return new URI('').withScheme(SCHEME).withPath(fsUri.path.base);

    }

    export function toFsUri(root: URI, userUri: URI): URI {
        return userUri.withPath(root.path.join(userUri.path.toString()));
    }

}
