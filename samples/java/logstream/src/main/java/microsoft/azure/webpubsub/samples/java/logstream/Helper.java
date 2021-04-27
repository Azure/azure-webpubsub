package microsoft.azure.webpubsub.samples.java.logstream;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class Helper {

    public String negotiationEndpoint = "http://localhost:8080/negotiate";
    public String group = "stream";

    public String getCurrentTime() {
        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss");
        LocalDateTime now = LocalDateTime.now();
        return dtf.format(now);
    }

    public String getSendToGroupRole(String group) {
        return String.format("webpubsub.sendToGroup.%s", group);
    }

    public String getJoinLeaveGroupRole(String group) {
        return String.format("webpubsub.joinLeaveGroup.%s", group);
    }
}
