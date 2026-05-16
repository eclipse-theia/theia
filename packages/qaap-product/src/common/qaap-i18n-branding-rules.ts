// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

interface BrandingRule {
    pattern: RegExp;
    replacement: string;
}

/** Per-locale regex replacements for translated / default UI strings. */
const LOCALE_RULES: Record<string, BrandingRule[]> = {
    en: [
        { pattern: /on the machine running Theia\.?/gi, replacement: 'on the machine running this application.' },
        { pattern: /running Theia application/gi, replacement: 'running application window' },
        { pattern: /AI Support in the Theia IDE is available!/g, replacement: 'AI Support is available!' },
        { pattern: /in the code editor in the Theia IDE/gi, replacement: 'in the code editor in this application' },
        { pattern: /capabilities of Theia IDE/gi, replacement: 'capabilities of this application' },
        { pattern: /configure and manage LlamaFile models in Theia IDE/gi,
            replacement: 'configure and manage LlamaFile models in this application' },
        { pattern: /in the Theia IDE documentation/gi, replacement: 'in the application documentation' },
        { pattern: /in the Theia IDE\b/g, replacement: 'in this application' },
        { pattern: /within the Theia IDE\b/g, replacement: 'in this application' },
        { pattern: /in Theia IDE\b/g, replacement: 'in this application' },
        { pattern: /Theia IDE/g, replacement: 'this application' }
    ],
    de: [
        { pattern: /auf dem Rechner gespeichert, auf dem Theia ausgeführt wird/gi,
            replacement: 'auf dem Rechner gespeichert, auf dem diese Anwendung ausgeführt wird' },
        { pattern: /der laufenden Theia-Anwendung/gi, replacement: 'des laufenden Anwendungsfensters' },
        { pattern: /der halben Breite der laufenden Theia-Anwendung/gi,
            replacement: 'der halben Breite des laufenden Anwendungsfensters' },
        { pattern: /AI-Unterstützung in der Theia IDE ist verfügbar!/g, replacement: 'KI-Unterstützung ist verfügbar!' },
        { pattern: /in der Theia IDE\b/gi, replacement: 'in dieser Anwendung' },
        { pattern: /im Theia IDE\b/gi, replacement: 'in dieser Anwendung' },
        { pattern: /Theia IDE/g, replacement: 'diese Anwendung' }
    ],
    es: [
        { pattern: /en la máquina que ejecuta Theia/gi, replacement: 'en la máquina que ejecuta esta aplicación' },
        { pattern: /aplicación Theia en ejecución/gi, replacement: 'ventana de la aplicación en ejecución' },
        { pattern: /Theia IDE/g, replacement: 'esta aplicación' }
    ],
    fr: [
        { pattern: /sur la machine exécutant Theia/gi, replacement: 'sur la machine exécutant cette application' },
        { pattern: /application Theia en cours/gi, replacement: 'fenêtre de l\'application en cours' },
        { pattern: /Theia IDE/g, replacement: 'cette application' }
    ],
    'pt-br': [
        { pattern: /na máquina em que o Theia está em execução/gi,
            replacement: 'na máquina em que esta aplicação está em execução' },
        { pattern: /aplicação Theia em execução/gi, replacement: 'janela da aplicação em execução' },
        { pattern: /Theia IDE/g, replacement: 'esta aplicação' }
    ],
    it: [
        { pattern: /sulla macchina che esegue Theia/gi, replacement: 'sulla macchina che esegue questa applicazione' },
        { pattern: /Theia IDE/g, replacement: 'questa applicazione' }
    ],
    ja: [
        { pattern: /Theia IDE/g, replacement: 'this application' },
        { pattern: /Theia を実行しているマシン/g, replacement: 'このアプリケーションを実行しているマシン' }
    ],
    ko: [
        { pattern: /Theia IDE/g, replacement: 'this application' },
        { pattern: /Theia를 실행하는 머신/g, replacement: '이 애플리케이션을 실행하는 머신' }
    ],
    'zh-cn': [
        { pattern: /Theia IDE/g, replacement: '本应用程序' },
        { pattern: /运行 Theia 的机器/g, replacement: '运行本应用程序的机器' }
    ],
    'zh-tw': [
        { pattern: /Theia IDE/g, replacement: '本應用程式' },
        { pattern: /執行 Theia 的機器/g, replacement: '執行本應用程式的機器' }
    ],
    ru: [
        { pattern: /Theia IDE/g, replacement: 'this application' },
        { pattern: /компьютере, на котором запущен Theia/gi, replacement: 'компьютере, на котором запущено это приложение' }
    ],
    tr: [
        { pattern: /Theia IDE/g, replacement: 'this application' }
    ],
    pl: [
        { pattern: /Theia IDE/g, replacement: 'this application' },
        { pattern: /maszynie uruchomionym Theia/gi, replacement: 'maszynie uruchomionej tej aplikacji' }
    ],
    cs: [
        { pattern: /Theia IDE/g, replacement: 'this application' }
    ],
    hu: [
        { pattern: /Theia IDE/g, replacement: 'this application' }
    ]
};

const DEFAULT_RULES: BrandingRule[] = [
    { pattern: /on the machine running Theia\.?/gi, replacement: 'on the machine running this application.' },
    { pattern: /Theia IDE/g, replacement: 'this application' }
];

export function applyQaapBrandingToText(text: string, languageId: string): string {
    const rules = LOCALE_RULES[languageId] ?? DEFAULT_RULES;
    let result = text;
    for (const { pattern, replacement } of rules) {
        result = result.replace(pattern, replacement);
    }
    return result;
}
