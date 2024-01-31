import { useState, useRef } from "react";
import { Checkbox, Dropdown, Option, Textarea, Input } from "@fluentui/react-components";
import { DefaultButton, DetailsList, DetailsListLayoutMode, SelectionMode } from "@fluentui/react";
import { ResizablePanel } from "../../components/ResizablePanel";
import { TrafficItem } from "../../components/TrafficItem";
import { ConnectionStatus } from "../../models";
import { MessageBar, MessageBarBody } from "@fluentui/react-components";
import { ClientPannelProps, PlaygroundState } from "../Playground";

export const SimpleClientSection = ({ onStatusChange, url }: ClientPannelProps) => {
  const transferOptions = [
    { key: "text", text: "Text" },
    //   { key: "binary", text: "Binary" }, // TODO: support binary
  ];
  const [connected, setConnected] = useState<boolean>(false);
  const [showSubprotocol, setShowSubprotocol] = useState(false);
  const [subprotocol, setSubprotocol] = useState("");
  const [state, setState] = useState<PlaygroundState>({
    transferFormat: "json",
    message: "",
    traffic: [],
    error: "",
  });

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
        setState((prevState) => ({ ...prevState, connected: true, traffic: [], error: "" }));
      };
      connection.onclose = (event) => {
        onStatusChange(ConnectionStatus.Disconnected);
        setConnected(false);
        setState((prevState) => ({
          ...prevState,
          traffic: [],
          error: `WebSocket connection closed with code ${event.code}, reason ${event.reason}.`,
        }));
      };
      connection.onmessage = (ev) => {
        setState((prevState) => ({
          ...prevState,
          traffic: [{ content: ev.data }, ...prevState.traffic],
        }));
      };
      connectionRef.current = connection;
    } catch (e) {
      setState((prevState) => ({
        ...prevState,
        error: "Error establishing the WebSocket connection.",
      }));
    }
  };

  const send = () => {
    if (!connectionRef.current) {
      console.error("Connection is not connected");
      return;
    }
    const message = state.message;
    if (message) {
      connectionRef.current.send(message);
    }
    setState((prevState) => ({
      ...prevState,
      message: "",
      traffic: [{ content: message, up: true }, ...prevState.traffic],
    }));
  };
  const connectPane = (
    <div className="d-flex flex-column websocket-client-container m-2 flex-fill">
      {connected && (
        <div className="d-flex flex-column flex-fill">
          <div>Messages</div>
          <Textarea
            className="flex-fill"
            value={state.message}
            placeholder="Enter your message here"
            onChange={(ev, data) => {
              setState((prevState) => ({ ...prevState, message: data.value }));
            }}
          />
          <div className="d-flex justify-content-between">
            <Dropdown
              defaultSelectedOptions={[transferOptions[0].key]}
              placeholder={transferOptions[0].text}
              onOptionSelect={(e, d) => {
                setState((prevState) => ({ ...prevState, transferFormat: d.optionValue as "text" | "binary" }));
              }}
            >
              {transferOptions.map((option) => (
                <Option key={option.key} value={option.key}>
                  {option.text}
                </Option>
              ))}
            </Dropdown>
            <DefaultButton disabled={!connected || !state.message} text="Send" onClick={send}></DefaultButton>
          </div>
        </div>
      )}
    </div>
  );
  const trafficList = state.traffic?.map((i) => TrafficItem(i));
  const trafficPane = (
    <div>
      <DetailsList items={trafficList} selectionMode={SelectionMode.none} layoutMode={DetailsListLayoutMode.justified}></DetailsList>
    </div>
  );
  return (
    <>
      <div className="d-flex flex-row">
        <Input className="flex-fill" readOnly={true} placeholder="Loading" value={url}></Input>
        {url && !connected && (
          <DefaultButton className="flex-right" onClick={connect}>
            Connect
          </DefaultButton>
        )}

        {url && connected && (
          <DefaultButton className="flex-right" onClick={disconnect}>
            Disconnect
          </DefaultButton>
        )}
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
      {connected && (
        <p className="text-success">
          <i>Connected</i>
        </p>
      )}
      {!connected && (
        <p className="text-info">
          <i>Disconnected</i>
        </p>
      )}
      {state.error && <b className="text-danger">{state.error}</b>}
      {connected && <ResizablePanel className="flex-fill" left={connectPane} right={trafficPane}></ResizablePanel>}
    </>
  );
};
