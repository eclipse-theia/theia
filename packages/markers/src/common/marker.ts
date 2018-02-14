/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

/*
* A marker represents meta information for a given uri
*/
export interface Marker<T> {
    /**
     * the uri this marker is associated with.
     */
    uri: string;
    /*
     * the owner of this marker. Any string provided by the registrar.
     */
    owner: string;

    /**
     * the kind, e.g. 'problem'
     */
    kind?: string;

    /*
     * marker kind specific data
     */
    data: T;
}
