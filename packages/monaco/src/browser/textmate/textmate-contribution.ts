/**
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { TextmateRegistry } from "./textmate-registry";

/**
 * Callback for extensions to contribute language grammar definitions
 */
export const LanguageGrammarDefinitionContribution = Symbol('LanguageGrammarDefinitionContribution');
export interface LanguageGrammarDefinitionContribution {
    registerTextmateLanguage(registry: TextmateRegistry): void;
}
