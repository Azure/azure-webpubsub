import { useState, useRef } from "react";
import { Checkbox, Dropdown, Option, Textarea, Input, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { DefaultButton, DetailsList, DetailsListLayoutMode, SelectionMode } from "@fluentui/react";
import { ResizablePanel } from "../../components/ResizablePanel";
import { TrafficItem } from "../../components/TrafficItem";
import { ConnectionStatus } from "../../models";
import { ClientPannelProps } from "../Playground";

interface TrafficItemViewModel {
  content: string;
  up: boolean;
}
export const SimpleClientSection = ({ onStatusChange, url }: ClientPannelProps) => {
  const transferOptions = [
    { key: "text", text: "Text" },
    //   { key: "binary", text: "Binary" }, // TODO: support binary
  ];
  const [connected, setConnected] = useState<boolean>(false);
  const [showSubprotocol, setShowSubprotocol] = useState(false);
  const [subprotocol, setSubprotocol] = useState("");
  const [traffic, setTraffic] = useState<TrafficItemViewModel[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [transferFormat, setTransferFormat] = useState<string>("");

  const connectionRef = useRef<WebSocket | null>(null);

  const disconnect = () => {
    onStatusChange(ConnectionStatus.Disconnected);
    setConnected(false);
    connectionRef.current?.close();
    return true;
  };
  const connect = () => {
    try {
      const connection = new WebSocket(url, showSubprotocol ? subprotocol : undefined);
      connection.onopen = (event) => {
        setConnected(true);
        onStatusChange(ConnectionStatus.Connected);
        setTraffic([]);
        setError("");
      };
      connection.onclose = (event) => {
        onStatusChange(ConnectionStatus.Disconnected);
        setConnected(false);
        setTraffic([]);
        setError(`WebSocket connection closed with code ${event.code}, reason ${event.reason}.`);
      };
      connection.onmessage = (ev) => {
        setTraffic((e) => [{ content: ev.data, up: false }, ...e]);
      };
      connectionRef.current = connection;
    } catch (e) {
      setError("Error establishing the WebSocket connection.");
    }
  };

  const send = () => {
    if (!connectionRef.current) {
      setError("Connection is not yet connected");
      return;
    }
    if (message) {
      if (transferFormat === "text") {
        connectionRef.current.send(message);
      } else {
        setError("Binary transfer is not supported yet");
      }
    }
    setMessage("");
    setTraffic((e) => [{ content: message, up: true }, ...e]);
  };
  const connectPane = (
    <div className="d-flex flex-column websocket-client-container m-2 flex-fill">
      {connected && (
        <div className="d-flex flex-column flex-fill">
          <div>Messages</div>
          <Textarea
            className="flex-fill"
            value={message}
            placeholder="Enter your message here"
            onChange={(ev, data) => {
              setMessage(data.value ?? "");
            }}
          />
          <div className="d-flex justify-content-between">
            <Dropdown
              defaultSelectedOptions={[transferOptions[0].key]}
              placeholder={transferOptions[0].text}
              onOptionSelect={(e, d) => {
                setTransferFormat(d.optionValue as string);
              }}
            >
              {transferOptions.map((option) => (
                <Option key={option.key} value={option.key}>
                  {option.text}
                </Option>
              ))}
            </Dropdown>
            <DefaultButton disabled={!connected || !message} text="Send" onClick={send}></DefaultButton>
          </div>
        </div>
      )}
    </div>
  );
  const trafficList = traffic?.map((i) => TrafficItem(i));
  const trafficPane = (
    <div>
      <DetailsList items={trafficList} selectionMode={SelectionMode.none} layoutMode={DetailsListLayoutMode.justified}></DetailsList>
    </div>
  );
  return (
    <>
      <div className="d-flex">
        <Input className="flex-fill" readOnly={true} placeholder="Loading" value={url}></Input>
      </div>
      {!connected && (
        <div className="d-flex flex-row">
          <Checkbox label="Specify subprotocol" checked={showSubprotocol} onChange={(e, c) => setShowSubprotocol(!!c.checked)} />

          {showSubprotocol && <Input className="flex-fill" placeholder="Specify the WebSocket subprotocol" value={subprotocol} onChange={(ev, data) => setSubprotocol(data.value)}></Input>}
        </div>
      )}
      {!connected && showSubprotocol && (
        <MessageBar>
          <MessageBarBody>
            Make sure to configure <code>connect</code> event handler in your Web PubSub service to response accepted subprotocol if subprotocol is specified.
          </MessageBarBody>
        </MessageBar>
      )}

      <div className="my-2">
        {url && !connected && <DefaultButton onClick={connect}>Connect</DefaultButton>}
        {url && connected && <DefaultButton onClick={disconnect}>Disconnect</DefaultButton>}
      </div>
      {error && (
        <MessageBar intent="error" className="text-danger">
          {error}
        </MessageBar>
      )}
      {connected && <ResizablePanel className="flex-fill" left={connectPane} right={trafficPane}></ResizablePanel>}
    </>
  );
};
