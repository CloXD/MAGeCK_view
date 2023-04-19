#!/bin/bash

awk -v mageck="./dist/mageck.js" ' {print} /^\/\/MAGECK_VIEW/ { while ((getline line < mageck ) > 0) { print line } }' ./.template.html > ./mageckView.html