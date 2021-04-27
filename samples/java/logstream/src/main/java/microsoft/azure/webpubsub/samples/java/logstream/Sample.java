package microsoft.azure.webpubsub.samples.java.logstream;

import javafx.application.Application;

public class Sample {
    public static String hubName = "stream";
    public static String connectionString = "<connection-string>";

    public static void main(String[] args) {
        NegotiationServer negotiationServer = new NegotiationServer(hubName, connectionString);
        try {
            negotiationServer.start();
            Application.launch(Monitor.class, args);
        } catch (Exception ex) {
            ex.printStackTrace();
        }
    }
}
