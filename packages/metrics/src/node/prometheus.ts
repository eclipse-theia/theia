/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export function toPrometheusValidName(name: string): string {
    /* Make sure that start of name is valid and respect [a-zA-Z_:] */
    const validFirstCharString = name.replace(/(^[^a-zA-Z_:]+)/gi, '');
    /* Make sure that rest of the name respect [a-zA-Z0-9_:]* */
    const validPrometheusName = validFirstCharString.replace(/([^a-zA-Z0-9_:])/gi, "_");
    return validPrometheusName;
}

export const PROMETHEUS_REGEXP = /^[a-zA-Z_:][a-zA-Z0-9_:]*/;
