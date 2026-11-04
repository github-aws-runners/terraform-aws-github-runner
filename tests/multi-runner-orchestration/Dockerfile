FROM eclipse-temurin:21-jdk AS certificate
RUN keytool -genkeypair \
  -alias wiremock \
  -keyalg RSA \
  -keysize 2048 \
  -validity 3650 \
  -storetype PKCS12 \
  -keystore /tmp/wiremock.p12 \
  -storepass changeit \
  -keypass changeit \
  -dname "CN=wiremock" \
  -ext "SAN=dns:wiremock,dns:localhost,ip:127.0.0.1" \
  -noprompt

FROM wiremock/wiremock:3.13.2
COPY --from=certificate /tmp/wiremock.p12 /home/wiremock/wiremock.p12
COPY mappings /home/wiremock/mappings
ENTRYPOINT ["/docker-entrypoint.sh", "--https-port", "8443", "--https-keystore", "/home/wiremock/wiremock.p12", "--keystore-password", "changeit", "--key-manager-password", "changeit", "--keystore-type", "PKCS12", "--global-response-templating"]
