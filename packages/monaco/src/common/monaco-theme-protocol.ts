/**
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// Aliases for monaco.editor.{theme-interfaces}
export import MonacoThemeColor = monaco.editor.IColors;
export import MonacoTokenRule = monaco.editor.ITokenThemeRule;
export import MonacoBuiltinTheme = monaco.editor.BuiltinTheme;
export interface MonacoTheme extends monaco.editor.IStandaloneThemeData {
    name: string;
}

export const MonacoThemeProvider = Symbol('MonacoThemeProvider');
export interface MonacoThemeProvider {

    /**
     * Asynchronous call, this fetches all the available themes for the monaco editor.
     */
    gatherMonacoThemes(): Promise<MonacoTheme[]>;
}
