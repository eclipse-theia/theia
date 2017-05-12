# Theia

A Javascript framework for native desktop and cloud-based IDEs.

![Theia](https://cloud.githubusercontent.com/assets/372735/25758586/6939d0de-31cf-11e7-998a-e4ce997dd6b8.png)

## Scope
 - Provide the end-user with a full-fledged multi-language IDE  (not just a smart editor)
 - Support equally the paradigm of Cloud IDE and Desktop IDE
 - Provide extenders with a platform on which to build their own products
 - Provide support for multiple languages via the language and debug server protocols
 
 ### Running the browser example
 ```
 git clone https://github.com/TypeFox/Theia.git \
 && cd Theia \
 && npm install \
 && cd releng/file-dependency-updater/ \
 && npm install \
 && cd ../../examples/browser/ \
 && npm install \
 && npm run cold:start:browser
 ```

 ### Running the electron example
 ```
 git clone https://github.com/TypeFox/Theia.git \
 && cd Theia \
 && npm install \
 && cd examples/electron/ \
 && npm install \
 && npm run cold:start:electron
 ```
