FROM alpine:3.13@sha256:469b6e04ee185740477efa44ed5bdd64a07bbdd6c7e5f5d169e540889597b911 AS env
WORKDIR app
RUN apk add --update --no-cache icu-dev

FROM env AS configured
RUN echo foo > foo.txt

FROM configured AS server
COPY . .
CMD ls

FROM configured AS testenv
ARG BUILD_ARG_1
ARG BUILD_ARG_2
RUN apk add --update --no-cache libzip-dev
RUN echo ${BUILD_ARG_1} > build_arg_1.txt
RUN echo ${BUILD_ARG_2} > build_arg_2.txt
COPY . .
RUN echo bar > bar.txt
CMD ls
