package microsoft.azure.webpubsub.samples.java.logstream;

import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.stage.Stage;

import java.net.URL;

public class Monitor extends Application {
    @Override
    public void start(Stage primaryStage) throws Exception {
        URL resourceLocation = getClass().getResource("/fxml/monitor.fxml");
        Parent root = FXMLLoader.load(resourceLocation);
        primaryStage.setTitle("Log Stream");
        primaryStage.setMinWidth(900);
        primaryStage.setMaxWidth(900);
        primaryStage.setMinHeight(500);
        primaryStage.setMaxHeight(500);
        Scene scene = new Scene(root, 900, 500);
        scene.getStylesheets().add(getClass().getResource("/css/monitor.css").toExternalForm());
        primaryStage.setScene(scene);
        primaryStage.show();
    }
}
