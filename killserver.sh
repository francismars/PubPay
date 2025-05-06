#!/bin/bash

grepped=$(pgrep -a node | grep ./bin/www);
read -a pidMarsPay <<< $grepped;
pidFinal=$(echo ${pidMarsPay[0]});
$(sudo kill $pidFinal)

