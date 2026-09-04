import com.azure.core.http.HttpClient;
import com.azure.core.http.HttpHeaderName;
import com.azure.core.http.policy.HttpLogDetailLevel;
import com.azure.core.http.policy.HttpLogOptions;
import com.azure.core.http.rest.RequestOptions;
import com.azure.core.http.rest.Response;
import com.azure.core.test.TestMode;
import com.azure.core.test.TestProxyTestBase;
import com.azure.core.test.annotation.DoNotRecord;
import com.azure.core.util.BinaryData;
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.messaging.webpubsub.models.GetClientAccessTokenOptions;
import com.azure.messaging.webpubsub.models.WebPubSubContentType;
import com.azure.messaging.webpubsub.models.WebPubSubPermission;
import com.nimbusds.jwt.JWT;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.JWTParser;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.time.Duration;
import io.github.cdimascio.dotenv.Dotenv;

public class TestEnvironment {
    public static String connectionString;

    @BeforeAll
    public static void globalSetup() {
        // TODO: provision the resources?
        // What if multiple different resources needed?
        Dotenv dotenv = Dotenv.load();

        connectionString = dotenv.get("WEB_PUBSUB_CONNECTION_STRING");
        if (connectionString == null || connectionString.isEmpty()) {
            throw new IllegalStateException("Please set the WEB_PUBSUB_CONNECTION_STRING environment variable.");
        }
    }

    @AfterAll
    public static void globalTeardown() {
        // Clean up any resources if necessary
    }
}
