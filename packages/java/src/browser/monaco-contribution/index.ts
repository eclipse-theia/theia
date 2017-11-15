/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JAVA_LANGUAGE_ID } from '../../common';
import { configuration, monarchLanguage } from "./java-monaco-language";

monaco.languages.register({
    id: JAVA_LANGUAGE_ID,
    extensions: ['.java', '.jav', '.class'],
    aliases: ['Java', 'java'],
    mimetypes: ['text/x-java-source', 'text/x-java'],
});

monaco.languages.onLanguage(JAVA_LANGUAGE_ID, () => {
    monaco.languages.setLanguageConfiguration(JAVA_LANGUAGE_ID, configuration);
    monaco.languages.setMonarchTokensProvider(JAVA_LANGUAGE_ID, monarchLanguage);
});
