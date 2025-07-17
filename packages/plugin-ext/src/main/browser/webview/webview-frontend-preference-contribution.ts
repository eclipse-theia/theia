import { nls, PreferenceContribution, PreferenceSchema, PreferenceSchemaService, PreferenceScope } from "@theia/core";
import { FrontendApplicationConfigProvider } from "@theia/core/lib/browser/frontend-application-config-provider";

const schema: PreferenceSchema = {
    properties: {
        'webview.warnIfUnsecure': {
            scope: PreferenceScope.Default,
            type: 'boolean',
            description: nls.localize('theia/plugin-ext/webviewWarnIfUnsecure', 'Warns users that webviews are currently deployed unsecurely.'),
            default: true,

        }
    }
};

export class WebviewFrontendPreferenceContribution implements PreferenceContribution {
    schema: PreferenceSchema = {
        properties: {}
    }
    async initSchema(service: PreferenceSchemaService): Promise<void> {
        const frontendConfig = FrontendApplicationConfigProvider.get();
        if (frontendConfig.securityWarnings) {
            service.addSchema(schema);
        }
    }
};
