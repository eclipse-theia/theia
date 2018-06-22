# Theia - Cloud & Desktop IDE
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/theia-ide/theia/labels/help%20wanted)
[![Gitter](https://img.shields.io/badge/chat-on%20gitter-blue.svg)](https://gitter.im/theia-ide/theia)
[![Build Status](https://travis-ci.org/theia-ide/theia.svg?branch=master)](https://travis-ci.org/theia-ide/theia)
[![Build status](https://ci.appveyor.com/api/projects/status/02s4d40orokl3njl/branch/master?svg=true)](https://ci.appveyor.com/project/kittaakos/theia/branch/master)
[![Open questions](https://img.shields.io/badge/Open-questions-pink.svg?style=flat-square)](https://github.com/theia-ide/theia/labels/question)
[![Open bugs](https://img.shields.io/badge/Open-bugs-red.svg?style=flat-square)](https://github.com/theia-ide/theia/labels/bug)

Theia is an extensible platform to develop full-fledged multi-language Cloud & Desktop IDE-like products with state-of-the-art web technologies.

![Theia](https://user-images.githubusercontent.com/372735/33182625-0f6575f0-d075-11e7-8ec7-53801e3892bd.jpg)

- [**Website**](#website)
- [**Scope**](#scope)
- [**Getting Started**](#getting-started)
- [**Contributing**](#contributing)
- [**Feedback**](#feedback)
- [**Roadmap**](#roadmap)
- [**License**](#license)

## Website

[Visit the Theia website](http://www.theia-ide.org) for more [documentation](http://www.theia-ide.org/doc).

## Scope
- Establish a platform to build IDE-like products
- Provide the end-user with a full-fledged multi-language IDE  (not just a smart editor)
- Support equally the paradigm of Cloud IDE and Desktop IDE
- Provide support for multiple languages via the language and debug server protocols
- Provide modern GUI with javascript UI libraries

## Getting Started
Here you can find guides and examples for common scenarios:
- [Develop a new Theia extension](http://www.theia-ide.org/doc/Authoring_Extensions.html)
- Develop a new Theia application for [Cloud](examples/browser/package.json) or [Desktop](examples/electron/package.json) with [Theia CLI](dev-packages/cli/README.md)
- [Run Theia IDE for Web Developers with Docker](https://github.com/theia-ide/theia-apps#theia-docker)
- [Package a desktop Theia application with Electron](https://github.com/theia-ide/yangster-electron)

## Contributing

Read below to learn how to take part in improving Theia:
- Fork the repository and [run the examples from source](doc/Developing.md#quick-start)
- Get familiar with [the development workflow](doc/Developing.md), [Coding Guidelines](https://github.com/theia-ide/theia/wiki/Coding-Guidelines), [Code of Conduct](CODE_OF_CONDUCT.md) and [learn how to sign your work](CONTRIBUTING.md#sign-your-work)
- Find an issue to work on and submit a pull request
  - First time contributing to open source? Pick a [good first issue](https://github.com/theia-ide/theia/labels/good%20first%20issue) to get you familiar with GitHub contributing process.
  - First time contributing to Theia? Pick a [beginner friendly issue](https://github.com/theia-ide/theia/labels/beginners) to get you familiar with codebase and our contributing process.
  - Want to become a Committer? Solve an issue showing that you understand Theia objectives and architecture. [Here](https://github.com/theia-ide/theia/labels/help%20wanted) is a good list to start.
- Could not find an issue? Look for bugs, typos, and missing features.

## Feedback

Read below how to engage with Theia community:
- Join the discussion on [Gitter](https://gitter.im/theia-ide/theia).
- Ask a question, request a new feature and file a bug with [GitHub issues](https://github.com/theia-ide/theia/issues/new).
- Star the repository to show your support.
- Follow Theia on [Twitter](https://twitter.com/theia_ide).

## Roadmap
During the first half of 2018, the team is focusing on the following features:
 
 - __Debugging__ 
   
   A visual debugger leveraging the Debug Server Protocol defined by the VS Code team.

 - __Workbench Improvements__

   Theia's workbench shell will be improved, such that the user can drag and drop widgets from the side bar to the main area and vice-versa.

 - __Search__

   Theia already can search files by name (<kbd>CMD</kbd> + <kbd>P</kbd>). In early 2018 a full text search shall be developed and added.
 
 - __More Git Support__

   In addition to the already present commit staging view, the team will add a git history and git diff view to better visualize the different states of git repositories. 

 - __Navigator Improvements__

   The file navigator shall support decorations, which are to be used by the git and the problems view extensions. It will allow to signal on a file whether there are git changes resp. diagnostics.

 - __Better Markdown Support__ 

   The Markdown support shall be improved to allow better preview that syncs scrolling. Also rendering plug-ins based on `markdown-it` shall be supported and tools like linters and dead link checkers shall be integrated.

 - __Robustness and Improved UX__
   We will further work on simplifying Theia and its UI / UX, improve the performance and keep working on bug reports that are rolling in.

 - __More__

   Any contributors might want to work on additional things. At least this happened in 2017 and is likely to increase with a growing community. :) 

## License

- [Eclipse Public License 2.0](LICENSE)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](LICENSE)

