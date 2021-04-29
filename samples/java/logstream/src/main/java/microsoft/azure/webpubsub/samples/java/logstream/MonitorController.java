package microsoft.azure.webpubsub.samples.java.logstream;

import java.io.IOException;
import java.net.URISyntaxException;
import java.net.URL;
import java.util.ResourceBundle;

import com.jfoenix.controls.JFXTextArea;
import javafx.beans.value.ChangeListener;
import javafx.beans.value.ObservableValue;
import javafx.event.EventHandler;
import javafx.fxml.FXML;
import javafx.fxml.Initializable;
import javafx.scene.control.Alert;
import javafx.scene.input.KeyCode;
import javafx.scene.input.KeyEvent;

public class MonitorController implements Initializable {
    @FXML
    private JFXTextArea producerTextArea;

    @FXML
    private JFXTextArea consumerTextArea;

    private String content = "";

    public void initialize(URL location, ResourceBundle resources) {
        producerTextArea.setPrefHeight(300);
        consumerTextArea.setPrefHeight(300);

        Helper helper = new Helper();
        LogStream streamProducer = new LogStream(helper.negotiationEndpoint);
        LogStream streamConsumer = new LogStream(helper.negotiationEndpoint);

        try {
            streamConsumer.connect(helper.getJoinLeaveGroupRole(helper.group), message -> {
                consumerTextArea.appendText(message);
                return null;
            });
            streamProducer.connect(helper.getSendToGroupRole(helper.group), null);
        } catch (URISyntaxException e) {
            e.printStackTrace();
        } catch (InterruptedException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }

        producerTextArea.addEventFilter(KeyEvent.KEY_PRESSED, new EventHandler<KeyEvent>() {
            public void handle(KeyEvent event) {
                if (event.getCode() == KeyCode.BACK_SPACE || event.getCode() == KeyCode.DELETE) {
                    event.consume(); // to cancel character-removing keys
                }
            }
        });

        producerTextArea.textProperty().addListener(new ChangeListener<String>() {
            @Override
            public void changed(ObservableValue<? extends String> observableValue, String oldValue, String newValue) {
                if (newValue.startsWith(content)) {
                    streamProducer.write(newValue.substring(content.length()));
                    content = newValue;
                }
                else {
                    showAlert();
                    producerTextArea.setText(content);
                }
            }
        });
    }

    private void showAlert() {
        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.setTitle("Invalid Input");
        alert.setHeaderText(null);
        alert.setContentText("Only Allow Appending Texts");
        alert.showAndWait();
    }
}
