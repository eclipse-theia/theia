/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

declare module "gitignore-parser" {
    /**
     * Parse the given `.gitignore` content and return an array
     * containing two further arrays - positives and negatives.
     * Each of these two arrays in turn contains two regexps, one
     * strict and one for 'maybe'.
     *
     * @param  {String} content  The content to parse,
     * @return {Array[]}         The parsed positive and negatives definitions.
     */
    export function parse(gitIgnoreContent: string): string[][];
}