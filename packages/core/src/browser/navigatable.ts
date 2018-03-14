/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from '../common/uri';

/**
 * Each widget which holds an uri to a workspace file and wants to be able to reveal that file in navigator,
 * (e.g. editor, image viewer, diff editor, etc.) has to implement this interface and provide the file uri on demand.
 * No additional registration is needed.
 */
export interface Navigatable {
    getTargetUri(): URI | undefined;
}

export namespace Navigatable {
    export function is(arg: Object | undefined): arg is Navigatable {
        return !!arg && 'getTargetUri' in arg && typeof (arg as any).getTargetUri === 'function';
    }
}
