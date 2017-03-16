# Theia

A Javascript framework for native desktop and cloud-based IDEs.

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
&& npm run build \
&& cd examples/browser \
&& npm run install:theia \
&& npm install \
&& npm run build:app \
&& npm run build:web \
&& npm run start:web
```

 ### Running the electron example
 ```
 git clone https://github.com/TypeFox/Theia.git \
&& cd Theia \
&& npm install \
&& npm run build \
&& cd examples/browser \
&& npm run install:theia \
&& npm install \
&& npm run build:app \
&& npm run build:electron \
&& npm run start:electron
```
