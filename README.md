# Theia - Build Cloud & Desktop IDEs with modern web tech.
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/theia-ide/theia/labels/help%20wanted)
[![Gitter](https://img.shields.io/badge/chat-on%20gitter-blue.svg)](https://gitter.im/theia-ide/theia)
[![Build Status](https://travis-ci.org/theia-ide/theia.svg?branch=master)](https://travis-ci.org/theia-ide/theia)
[![Build status](https://ci.appveyor.com/api/projects/status/02s4d40orokl3njl/branch/master?svg=true)](https://ci.appveyor.com/project/kittaakos/theia/branch/master)
[![Open questions](https://img.shields.io/badge/Open-questions-pink.svg?style=flat-square)](https://github.com/theia-ide/theia/labels/question)
[![Open bugs](https://img.shields.io/badge/Open-bugs-red.svg?style=flat-square)](https://github.com/theia-ide/theia/labels/bug)

Theia is an extensible platform to develop full-fledged multi-language Cloud & Desktop IDE-like products with state-of-the-art web technologies.

![Theia](https://user-images.githubusercontent.com/3082655/32766055-816eb1a8-c90d-11e7-8df7-31014cb53172.png)

A [`beta` version of Theia](https://github.com/theia-ide/theia/milestone/3) is planned for December 6, 2017, look at our [roadmap](#roadmap).

- [**Scope**](#scope)
- [**Getting Started**](#getting-started)
- [**Documentation**](#documentation)
- [**Contributing**](#contributing)
- [**Feedback**](#feedback)
- [**Roadmap**](#roadmap)
- [**License**](#license)

## Scope
- Establish a platform to build IDE-like products
- Provide the end-user with a full-fledged multi-language IDE  (not just a smart editor)
- Support equally the paradigm of Cloud IDE and Desktop IDE
- Provide support for multiple languages via the language and debug server protocols
- Provide modern GUI with javascript UI libraries

## Getting Started
Here you can find guides and examples for common scenarios:
- [Develop a new Theia extension](doc/Authoring_Extensions.md)
- Develop a new Theia application for [Cloud](examples/browser/package.json) or [Desktop](examples/electron/package.json) with [Theia CLI](dev-packages/cli/README.md)
- [Run Theia IDE for Web Developers with Docker](https://github.com/theia-ide/theia-apps#theia-docker)
- [Package a desktop Theia application with Electon](https://github.com/theia-ide/yangster-electron)

## Documentation

There are guides to get familiar with Theia architecture and internals:
- [**Architecture**](doc/Architecture.md#architecture)
  - [**Dependency Injection**](doc/Architecture.md#dependency-injection-di)
  - [**Extensions**](doc/Architecture.md#extensions)
  - [**Services**](doc/Architecture.md#services)
  - [**Contributions**](doc/Architecture.md#contribution-points)
- [**Developing an extension**](doc/Authoring_Extensions.md)
  - [**Frontend-backend communications**](doc/Internals.md#backendfrontend)
  - [**Events**](doc/Internals.md#events)
  - [**Commands**](doc/Commands_Keybindings.md)
  - [**Preferences**](doc/Preferences.md)

## Contributing

Read below to learn how to take part in improving Theia:
- Fork the repository and [run the examples from source](doc/Developing.md#quick-start)
- Get familiar with [the development workflow](doc/Developing.md), [Coding Guidlines](https://github.com/theia-ide/theia/wiki/Coding-Guidelines), [Code of Conduct](CODE_OF_CONDUCT.md) and [learn how to sign your work](CONTRIBUTING.md#sign-your-work)
- Find an issue to work on and submit a pull request
  - First time contirbuting to open source? Pick a [good first issue](https://github.com/theia-ide/theia/labels/good%20first%20issue) to get you familiar with GitHub contributing process.
  - First time contributing to Theia? Pick a [beginner friendly issue](https://github.com/theia-ide/theia/labels/beginners) to get you familiar with codebase and our contributing process.
  - Want to become a Committer? Solve an issue showing that you understand Theia objectives and architecture. [Here](https://github.com/theia-ide/theia/labels/help%20wanted) is a good list to start.
- Could not find an issue? Look for bugs, typos and missing features.

## Feedback

Read below how to engage with Theia community:
- Join discussion on [Gitter](https://gitter.im/theia-ide/theia).
- Ask a question, request a new feature and file a bug with [GitHub issues](https://github.com/theia-ide/theia/issues/new).
- Star the repository to show your support.
- Follow Theia on [Twitter](https://twitter.com/theia_ide).

## Roadmap
The contributors have committed to deliver a framework with the following features by December 6, 2017:
 - Dynamic Extension System
 - Rich Text Editing incl. [Language Server Protocol](https://github.com/Microsoft/language-server-protocol) Support
 - Shell With Flexible Layouts and Side Panels
 - Electron & Browser Support
 - File Navigator
 - Monaco-based Editor
 - Terminal integration
 - Git integration
 - Language Support for TypeScript, C/C++, Java, Python, Go, [YANG](https://tools.ietf.org/html/rfc6020)
 - Diagramming Support through [Sprotty](https://github.com/theia-ide/sprotty)
 - [many more features](https://github.com/theia-ide/theia/milestone/3)

The team is also working on the following Open-Source Products based on Theia:
 - [Yangster](https://github.com/theia-ide/yangster) - A YANG IDE

## License

[Apache-2.0](LICENSE)
