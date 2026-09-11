FROM ubuntu:24.04
ARG TIPPECANOE_VERSION=2.79.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git build-essential zlib1g-dev libsqlite3-dev \
  && git clone --depth 1 --branch ${TIPPECANOE_VERSION} https://github.com/felt/tippecanoe.git /src/tippecanoe \
  && make -C /src/tippecanoe -j2 \
  && make -C /src/tippecanoe install \
  && rm -rf /var/lib/apt/lists/* /src/tippecanoe
ENTRYPOINT ["tippecanoe"]
