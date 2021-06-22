FROM alpine AS env
WORKDIR app
RUN apk add --update --no-cache icu-dev

FROM env AS configured
RUN echo foo > foo.txt

FROM configured AS server
CMD ls

FROM configured AS testenv
RUN apk add --update --no-cache libzip-dev
RUN echo bar > bar.txt
CMD ls
