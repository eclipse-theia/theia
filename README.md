# Theia
[![Gitter](https://img.shields.io/badge/chat-on%20gitter-blue.svg)](https://gitter.im/theia-ide/theia)
[![Build Status](https://travis-ci.org/theia-ide/theia.svg?branch=master)](https://travis-ci.org/theia-ide/theia)

Theia is a cloud & desktop IDE implemented in TypeScript.

![Theia](https://cloud.githubusercontent.com/assets/372735/25758586/6939d0de-31cf-11e7-998a-e4ce997dd6b8.png)

## Scope
 - Provide the end-user with a full-fledged multi-language IDE  (not just a smart editor)
 - Support equally the paradigm of Cloud IDE and Desktop IDE
 - Provide extenders with a platform on which to build their own products
 - Provide support for multiple languages via the language and debug server protocols
 
### Running the examples


 ### Running the electron example
 ```
 git clone https://github.com/TypeFox/Theia.git \
 && cd Theia \
 && npm install \
 && cd examples \
 && npm run install:theia \
 && npm install \
 && npm run cold:start:electron
 ```
 
### Running code coverage
 ```
npm run coverage

### to view result

firefox coverage/index.html 
 ```

You can find more details on how to run the examples [here](doc/Developing.md).
