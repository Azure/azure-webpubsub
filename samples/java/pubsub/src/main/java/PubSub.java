import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URISyntaxException;

public class PubSub {
    public static String connectionString = "<connection-string>";
    public static String hubName = "pubsub";

    public static void main(String[] args) throws URISyntaxException, InterruptedException, IOException {
        Subscriber subscriber = new Subscriber(connectionString, hubName);
        Publisher publisher = new Publisher(connectionString, hubName);

        subscriber.subscribe();
        System.out.println(String.format("Input any message to publish to hub [%s] (Press 'Q' to leave): ", hubName));
        while (true) {
            BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
            String message = reader.readLine();
            if (message.equals("Q")) break;
            publisher.publish(message);
        }
        ;
        subscriber.unsubscribe();
    }
}
