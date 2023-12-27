import { useState, useRef, useEffect } from "react";
import { DefaultButton, ComboBox, SelectableOptionMenuItemType, Checkbox, DetailsList, DetailsListLayoutMode, SelectionMode, TextField, Dropdown } from "@fluentui/react";
import { ResizablePanel } from "../ResizablePanel";
import { TrafficItem, TrafficItemProps } from "../TrafficItem";
import { ConnectionStatus } from "../../models";
import { useDataContext } from "../../providers/DataContext";

export interface PlaygroundProps {
  onStatusChange: (status: ConnectionStatus) => void;
}

interface PlaygroundState {
  traffic: TrafficItemProps[];
  hub: string;
  connected: boolean;
  transferFormat?: string;
  message?: string;
  showSubprotocol: boolean;
  subprotocol?: string;
  error: string;
}

export const Playground = ({ onStatusChange }: PlaygroundProps) => {
  const { data, dataFetcher } = useDataContext();
  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [state, setState] = useState<PlaygroundState>({
    hub: data.hub,
    connected: false,
    transferFormat: "json",
    message: "",
    showSubprotocol: false,
    subprotocol: "",
    traffic: [],
    error: "",
  });

  const connectionRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const fetchUrl = async () => {
      const url = await dataFetcher.invoke("getClientAccessUrl");
      setUrl(url);
      setLoading(false);
    };
    fetchUrl();
    const intervalId = setInterval(() => {
      fetchUrl();
    }, 60 * 10 * 1000); // every 1 minute

    // Clean up the interval on component unmount
    return () => clearInterval(intervalId);
  }, [dataFetcher]);

  const connect = () => {
    try {
      const connection = new WebSocket(url);
      connection.onopen = (event) => {
        onStatusChange(ConnectionStatus.Connected);
        setState((prevState) => ({ ...prevState, connected: true, traffic: [], error: "" }));
      };
      connection.onclose = (event) => {
        onStatusChange(ConnectionStatus.Disconnected);
        setState((prevState) => ({
          ...prevState,
          connected: false,
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

  const options = [
    {
      key: "Json",
      text: "Service supported JSON protocols",
      itemType: SelectableOptionMenuItemType.Header,
    },
    { key: "A", text: "json.webpubsub.azure.v1" },
    { key: "B", text: "json.reliable.webpubsub.azure.v1" },
    { key: "divider", text: "-", itemType: SelectableOptionMenuItemType.Divider },
    {
      key: "binary",
      text: "Service supported binary protocols",
      itemType: SelectableOptionMenuItemType.Header,
    },
    { key: "C", text: "protobuf.webpubsub.azure.v1" },
    { key: "D", text: "protobuf.reliable.webpubsub.azure.v1" },
  ];

  const transferOptions = [
    { key: "text", text: "Text" },
    { key: "binary", text: "Binary" },
  ];

  const connectPane = (
    <div className="d-flex flex-column websocket-client-container m-2">
      <b>Test Client</b>
      <input disabled={true} placeholder="Loading" value={url}></input>
      <DefaultButton hidden={!data.ready || state.connected || loading} onClick={connect}>
        Connect
      </DefaultButton>
      {state.connected && (
        <p className="text-success">
          <i>Connected</i>
        </p>
      )}
      {false && <Checkbox label="Specify subprotocol" checked={state.showSubprotocol} onChange={(e, c) => setState((prevState) => ({ ...prevState, showSubprotocol: c ?? false }))} />}
      <ComboBox
        hidden={!state.showSubprotocol}
        label="Subprotocol"
        allowFreeform={true}
        autoComplete="on"
        options={options}
        text={state.subprotocol}
        onChange={(e, c, i, value) => setState((prevState) => ({ ...prevState, subprotocol: value }))}
      />
      {state.error && <b className="text-danger">{state.error}</b>}
      {state.connected && (
        <div className="controlpane d-flex flex-column">
          {false && (
            <Dropdown
              label="Transfer Format"
              defaultSelectedKey={state.transferFormat}
              options={transferOptions}
              onChange={(e, i) => setState((prevState) => ({ ...prevState, transferFormat: i?.key.toString() }))}
            />
          )}
          <TextField label="Messages" multiline autoAdjustHeight value={state.message} onChange={(e, t) => setState((prevState) => ({ ...prevState, message: t }))} />
          <DefaultButton disabled={!state.connected || !state.message} text="Send" onClick={send}></DefaultButton>
        </div>
      )}
    </div>
  );
  const trafficList = state.traffic.map((i) => TrafficItem(i));
  const trafficPane = (
    <div>
      <DetailsList items={trafficList} selectionMode={SelectionMode.none} layoutMode={DetailsListLayoutMode.justified}></DetailsList>
    </div>
  );

  return <ResizablePanel className="flex-fill" left={connectPane} right={trafficPane}></ResizablePanel>;
};
