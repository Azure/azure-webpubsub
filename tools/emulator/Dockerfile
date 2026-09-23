ARG DOTNET_SDK_IMAGE=mcr.microsoft.com/dotnet/sdk:10.0.401
ARG DOTNET_RUNTIME_IMAGE=mcr.microsoft.com/dotnet/aspnet:10.0

FROM ${DOTNET_SDK_IMAGE} AS installer
ARG EMULATOR_VERSION
COPY Microsoft.Azure.WebPubSub.Emulator.*.nupkg /packages/
RUN printf '%s' "${EMULATOR_VERSION}" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$' \
    && test -f "/packages/Microsoft.Azure.WebPubSub.Emulator.${EMULATOR_VERSION}.nupkg" \
    && printf '%s\n' '<configuration><packageSources><clear /></packageSources></configuration>' > /tmp/local-packages.config \
    && dotnet tool install Microsoft.Azure.WebPubSub.Emulator --tool-path /opt/emulator \
        --configfile /tmp/local-packages.config --add-source /packages \
        --version "${EMULATOR_VERSION}" --no-cache

FROM ${DOTNET_RUNTIME_IMAGE}
ARG EMULATOR_VERSION
LABEL org.opencontainers.image.title="Azure Web PubSub Emulator" \
    org.opencontainers.image.description="Local development emulator for Azure Web PubSub; not for production use" \
    org.opencontainers.image.source="https://github.com/Azure/azure-webpubsub" \
    org.opencontainers.image.version="${EMULATOR_VERSION}"
COPY --from=installer /opt/emulator /opt/emulator
WORKDIR /app
ENV Urls=http://0.0.0.0:8080 \
    DOTNET_USE_POLLING_FILE_WATCHER=1
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["/opt/emulator/awps-emulator"]
