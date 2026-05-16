// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { TextReplacementContribution } from '@theia/core/lib/browser/preload/text-replacement-contribution';
import { applyQaapBrandingToText } from '../../common/qaap-i18n-branding-rules';

/** English default-string branding (preload) — same rules as {@link QaapLocalizationContribution}. */
export class QaapTextReplacementContribution implements TextReplacementContribution {

    getReplacement(locale: string): Record<string, string> {
        if (locale !== 'en' && !locale.startsWith('en-')) {
            return {};
        }
        const replacements: Record<string, string> = {};
        for (const from of ENGLISH_DEFAULT_STRINGS) {
            replacements[from] = applyQaapBrandingToText(from, 'en');
        }
        return replacements;
    }
}

const ENGLISH_DEFAULT_STRINGS: string[] = [
    'The position and size of the extracted widget will be half the width of the running Theia application.',
    'The position and size of the extracted widget will be the same as the running Theia application.',
    'AI Support in the Theia IDE is available!',
    'This agent provides inline code completion in the code editor in the Theia IDE.',
    'This agent is aware of all commands that the user can execute within the Theia IDE, the tool that the user is currently working with. Based on the user request, it can find the right command and then let the user execute it.',
    'This setting allows you to access the AI capabilities of Theia IDE.            \n            Please be aware that AI features may generate            continuous requests to the language models (LLMs) you provide access to. This might incur costs that you            need to monitor closely. By enabling this option, you acknowledge these risks.            \n            **Please note! The settings below in this section will only take effect\n            once the main feature setting is enabled. After enabling the feature, you need to configure at least one            LLM provider below. Also see [the documentation](https://theia-ide.org/docs/user_ai/)**.',
    'This setting allows you to configure and manage LlamaFile models in Theia IDE.            \n            Each entry requires a user-friendly `name`, the file `uri` pointing to your LlamaFile, and the `port` on which it will run.            \n            To start a LlamaFile, use the "Start LlamaFile" command, which enables you to select the desired model.            \n            If you edit an entry (e.g., change the port), any running instance will stop, and you will need to manually start it again.            \n            [Learn more about configuring and managing LlamaFiles in the Theia IDE documentation](https://theia-ide.org/docs/user_ai/#llamafile-models).',
    'Enter an API Key of your official Anthropic Account. **Please note:** By using this preference the Anthropic API key will be stored in clear text            on the machine running Theia. Use the environment variable `ANTHROPIC_API_KEY` to set the key securely.',
    'Enter an API Key for Claude Code. **Please note:** By using this preference the API key will be stored in clear text on the machine running Theia. Use the environment variable `ANTHROPIC_API_KEY` to set the key securely.',
    'Enter an API Key of your official Google AI (Gemini) Account. **Please note:** By using this preference the GOOGLE AI API key will be stored in clear text            on the machine running Theia. Use the environment variable `GOOGLE_API_KEY` to set the key securely.',
    'Enter an API Key for your Hugging Face Account. **Please note:** By using this preference the Hugging Face API key will be stored in clear text            on the machine running Theia. Use the environment variable `HUGGINGFACE_API_KEY` to set the key securely.',
    'Enter an API Key of your official OpenAI Account. **Please note:** By using this preference the Open AI API key will be stored in clear text on the machine running Theia. Use the environment variable `OPENAI_API_KEY` to set the key securely.',
    'Enter an API Key for Anthropic models used by the Vercel AI SDK.                 **Please note:** By using this preference the API key will be stored in clear text         on the machine running Theia. Use the environment variable `ANTHROPIC_API_KEY` to set the key securely.',
    'Enter an API Key for OpenAI models used by the Vercel AI SDK.                 **Please note:** By using this preference the API key will be stored in clear text         on the machine running Theia. Use the environment variable `OPENAI_API_KEY` to set the key securely.'
];
