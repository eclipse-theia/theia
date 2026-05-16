// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { TextReplacementContribution } from '@theia/core/lib/browser/preload/text-replacement-contribution';

/** English default-string branding without forking packages/core/i18n/nls.json. */
export class QaapTextReplacementContribution implements TextReplacementContribution {

    getReplacement(locale: string): Record<string, string> {
        if (locale !== 'en' && !locale.startsWith('en-')) {
            return {};
        }
        const replacements: Record<string, string> = {
            'The position and size of the extracted widget will be half the width of the running Theia application.':
                'The position and size of the extracted widget will be half the width of the running application window.',
            'The position and size of the extracted widget will be the same as the running Theia application.':
                'The position and size of the extracted widget will be the same as the running application window.',
            'AI Support in the Theia IDE is available!': 'AI Support is available!'
        };
        return { ...replacements, ...API_KEY_DESCRIPTIONS };
    }
}

const API_KEY_DESCRIPTIONS: Record<string, string> = {
    'Enter an API Key of your official Anthropic Account. **Please note:** By using this preference the Anthropic API key will be stored in clear text            on the machine running Theia. Use the environment variable `ANTHROPIC_API_KEY` to set the key securely.':
        'Enter an API Key of your official Anthropic Account. **Please note:** By using this preference the Anthropic API key will be stored in clear text            on the machine running this application. Use the environment variable `ANTHROPIC_API_KEY` to set the key securely.',
    'Enter an API Key for Claude Code. **Please note:** By using this preference the API key will be stored in clear text on the machine running Theia. Use the environment variable `ANTHROPIC_API_KEY` to set the key securely.':
        'Enter an API Key for Claude Code. **Please note:** By using this preference the API key will be stored in clear text on the machine running this application. Use the environment variable `ANTHROPIC_API_KEY` to set the key securely.',
    'Enter an API Key of your official Google AI (Gemini) Account. **Please note:** By using this preference the GOOGLE AI API key will be stored in clear text            on the machine running Theia. Use the environment variable `GOOGLE_API_KEY` to set the key securely.':
        'Enter an API Key of your official Google AI (Gemini) Account. **Please note:** By using this preference the GOOGLE AI API key will be stored in clear text            on the machine running this application. Use the environment variable `GOOGLE_API_KEY` to set the key securely.',
    'Enter an API Key for your Hugging Face Account. **Please note:** By using this preference the Hugging Face API key will be stored in clear text            on the machine running Theia. Use the environment variable `HUGGINGFACE_API_KEY` to set the key securely.':
        'Enter an API Key for your Hugging Face Account. **Please note:** By using this preference the Hugging Face API key will be stored in clear text            on the machine running this application. Use the environment variable `HUGGINGFACE_API_KEY` to set the key securely.',
    'Enter an API Key of your official OpenAI Account. **Please note:** By using this preference the Open AI API key will be stored in clear text on the machine running Theia. Use the environment variable `OPENAI_API_KEY` to set the key securely.':
        'Enter an API Key of your official OpenAI Account. **Please note:** By using this preference the Open AI API key will be stored in clear text on the machine running this application. Use the environment variable `OPENAI_API_KEY` to set the key securely.',
    'Enter an API Key for Anthropic models used by the Vercel AI SDK.                 **Please note:** By using this preference the API key will be stored in clear text         on the machine running Theia. Use the environment variable `ANTHROPIC_API_KEY` to set the key securely.':
        'Enter an API Key for Anthropic models used by the Vercel AI SDK.                 **Please note:** By using this preference the API key will be stored in clear text         on the machine running this application. Use the environment variable `ANTHROPIC_API_KEY` to set the key securely.',
    'Enter an API Key for OpenAI models used by the Vercel AI SDK.                 **Please note:** By using this preference the API key will be stored in clear text         on the machine running Theia. Use the environment variable `OPENAI_API_KEY` to set the key securely.':
        'Enter an API Key for OpenAI models used by the Vercel AI SDK.                 **Please note:** By using this preference the API key will be stored in clear text         on the machine running this application. Use the environment variable `OPENAI_API_KEY` to set the key securely.'
};
