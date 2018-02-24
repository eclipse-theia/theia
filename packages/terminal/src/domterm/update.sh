# DOMTERM_CLONE_DIR=${DOMTERM_CLONE_DIR-`pwd`/domterm-git}
DOMTERM_CLONE_DIR=`pwd`/../../../../node_modules/domterm
DOMVERSION_LOCAL_DIR="."

TMP_VERSION=$DOMVERSION_LOCAL_DIR/tmp-domterm-version.js
FILES_TO_COPY="domterm-core.css domterm-default.css domterm-standard.css  ResizeSensor.js wcwidth.js"

if test -d $DOMTERM_CLONE_DIR
then
     (cd $DOMTERM_CLONE_DIR && test -d .git && git pull)
else
    git clone https://github.com/PerBothner/DomTerm.git $DOMTERM_CLONE_DIR
fi

DOMTERM_VERSION=`sed -n -e '/AC_INIT/s|^.*\[\([0-9][^]]*\)\].*$|\1|p' <$DOMTERM_CLONE_DIR/configure.ac`
DOMTERM_YEAR=`sed -n -e '/DOMTERM_YEAR=/s|^.*[^0-9]\([1-9][0-9]*\)[^0-9]*$|\1|p' <$DOMTERM_CLONE_DIR/configure.ac`

sed -e "s/@DOMTERM_VERSION@/$DOMTERM_VERSION/" \
    -e "s/@DOMTERM_YEAR@/$DOMTERM_YEAR/" \
    -e '/@configure_input@/d' \
    <$DOMTERM_CLONE_DIR/hlib/domterm-version.js.in > $TMP_VERSION
cat $DOMTERM_CLONE_DIR/hlib/terminal.js $TMP_VERSION >$DOMVERSION_LOCAL_DIR/terminal.js
rm $TMP_VERSION

cat >../node/domterm-version.ts <<EOF
/*
 * Copyright (C) 2018 Per Bothner THIS FILE IS GENERATED. DO NOT EDIT.
 */
const DomTermVersionString = "0.98";
export const DomTermVersionInfo = "version=" + DomTermVersionString;
EOF

for file in $FILES_TO_COPY
do
    cp $DOMTERM_CLONE_DIR/hlib/$file $DOMVERSION_LOCAL_DIR/$file
done
