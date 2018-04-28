/*
 * Copyright (C) 2018 David Craven and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { RUST_LANGUAGE_ID, RUST_LANGUAGE_NAME } from '../../common';
import { configuration, monarchLanguage } from './rust-monaco-language';

monaco.languages.register({
    id: RUST_LANGUAGE_ID,
    extensions: ['.rs'],
    aliases: [RUST_LANGUAGE_NAME, 'rust'],
    mimetypes: ['text/x-rust-source', 'text/x-rust'],
});

monaco.languages.onLanguage(RUST_LANGUAGE_ID, () => {
    monaco.languages.setLanguageConfiguration(RUST_LANGUAGE_ID, configuration);
    monaco.languages.setMonarchTokensProvider(RUST_LANGUAGE_ID, monarchLanguage);
});
