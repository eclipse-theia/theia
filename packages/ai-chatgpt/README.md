<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - CHATGPT EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-chatgpt` extension serves OpenAI models through your ChatGPT subscription instead of an OpenAI API key.
The models appear as `chatgpt/<model>` in the model picker and coexist with the API-key based `openai/<model>` models contributed by `@theia/ai-openai`.

By default the models your ChatGPT plan grants are queried from the endpoint once you are signed in. Set the `ai-features.chatGpt.models`
preference to offer a fixed list of models instead. A built-in list is offered while the granted models cannot be determined, i.e. before the
first sign in or when the endpoint cannot be reached.

### Signing in

Run the command _ChatGPT: Sign in_, or use the sign in link in the settings under _AI Features_ &rarr; _ChatGPT_. It opens the OpenAI authorization
page in your browser. The browser returns the authorization code to a
listener on `http://localhost:1455/auth/callback`, which is provided by the Theia backend. If the backend does not run on the same machine as
your browser, or the port is already in use, you can paste the authorization code (or the full redirect URL) into the input box Theia offers
instead. The credentials are stored in the credential store of your operating system and are removed again by the command _ChatGPT: Sign out_.

While you are not signed in, the configured models are still listed, but reported as unavailable.

### Limitations

Requests are served by the ChatGPT endpoint `https://chatgpt.com/backend-api/codex`. That endpoint only supports the streaming Response API,
does not retain responses, and only serves the models included in your ChatGPT plan, so models configured by hand need to be available for
your plan. Because responses are not retained, server-side compaction is not offered for these models. The endpoint is not documented, so
neither the web search tool it offers nor the listing of the granted models is a contract: web search can be deselected again in the chat
capabilities, and the model listing is treated as a hint.

## Additional Information

- [API documentation for `@theia/ai-chatgpt`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_ai-chatgpt.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
