FROM alpine AS env
WORKDIR app
RUN apk add --update --no-cache icu-dev

FROM env AS configured
RUN echo foo > foo.txt

FROM configured AS server
COPY . .
CMD ls

FROM configured AS testenv
RUN apk add --update --no-cache libzip-dev
COPY . .
RUN echo bar > bar.txt
CMD ls
