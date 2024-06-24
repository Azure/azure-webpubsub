import { useState, useRef } from "react";
import { Checkbox, Textarea, Input, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { DefaultButton, DetailsList, DetailsListLayoutMode, SelectionMode } from "@fluentui/react";
// import { ResizablePanel } from "../../components/ResizablePanel";
// import { TrafficItem, TrafficItemViewModel } from "../../components/TrafficItem";
import { ConnectionStatus } from "../../models";
import { ClientPannelProps } from "../Playground";
import { TrafficItem, TrafficItemViewModel } from "../../components/TrafficItem";
import { ResizablePanel } from "../../components/ResizablePanel";
import { vscode } from "../../utilities/vscode";
import { VSCodeButton, VSCodeCheckbox, VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow, VSCodeDivider, VSCodePanelTab, VSCodePanelView, VSCodePanels, VSCodeTag, VSCodeTextArea, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";

export const SimpleClientSection = ({ onStatusChange, url }: ClientPannelProps) => {
  const [connected, setConnected] = useState<boolean>(false);
  const [showSubprotocol, setShowSubprotocol] = useState(false);
  const [subprotocol, setSubprotocol] = useState("");
  const [traffic, setTraffic] = useState<TrafficItemViewModel[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // TODO: Binary support?
  const transferFormat = "text";

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
        setTraffic((e) => [TrafficItem(ev.data), ...e]);
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
        setTraffic((e) => [TrafficItem(message, true), ...e]);
        setMessage("");
      } else {
        console.error("Binary transfer is not supported yet");
        setError("Binary transfer is not supported yet");
      }
    }
  };
  const connectPane = (
    <div className="d-flex flex-column websocket-client-container m-2 flex-fill">
      {connected && (
        <div className="d-flex flex-column flex-fill">
          {/* <div>Messages</div> */}
          <VSCodeTextArea
            className="flex-fill"
            value={message}
            placeholder="Enter your message here"
            onInput={(ev) => {
              console.log(ev);
              setMessage((ev.target as any).value ?? "");
            }}
          />
          <div className="d-flex justify-content-between">
            <VSCodeButton disabled={!connected || !message} onClick={send}> Send </VSCodeButton>
          </div>
        </div>
      )}
    </div>
  );
  const trafficPane = (
    <div>
      <VSCodeDataGrid>
        <VSCodeDataGridRow row-type="header">
          <VSCodeDataGridCell cell-type="columnheader" grid-column="1"> Data </VSCodeDataGridCell>
          <VSCodeDataGridCell cell-type="columnheader" grid-column="2"> Time </VSCodeDataGridCell>
          <VSCodeDataGridCell cell-type="columnheader" grid-column="3"> Length </VSCodeDataGridCell>
        </VSCodeDataGridRow>
        {traffic.map(row => (
          <VSCodeDataGridRow>
            <VSCodeDataGridCell grid-column="1">{row.Data}</VSCodeDataGridCell>
            <VSCodeDataGridCell grid-column="2">{row.Time}</VSCodeDataGridCell>
            <VSCodeDataGridCell grid-column="3">{row.Length}</VSCodeDataGridCell>
          </VSCodeDataGridRow>
        ))}
      </VSCodeDataGrid>

      {/* <DetailsList items={traffic} selectionMode={SelectionMode.none} layoutMode={DetailsListLayoutMode.justified}></DetailsList> */}
    </div>
  );
  return (
    <>
      <div className="d-flex">
        <VSCodeTag> Client Access URL </VSCodeTag>
        <VSCodeTextField className="flex-fill" readOnly={false} placeholder="Loading" value={url}></VSCodeTextField>
        {url && !connected && <VSCodeButton onClick={connect}>Connect</VSCodeButton>}
        {url && connected && <VSCodeButton onClick={disconnect}>Disconnect</VSCodeButton>}
      </div>
      
      {!connected && (
        <div className="d-flex flex-row">
          <VSCodeCheckbox checked={showSubprotocol} onChange={(e) => { setShowSubprotocol(!!(e.target as any)["_checked"])}}> { !showSubprotocol && "Specify Subprotocol" } </VSCodeCheckbox>
          {showSubprotocol && <VSCodeTag> SubProtocol </VSCodeTag>}
          {showSubprotocol && <VSCodeTextField className="flex-fill" placeholder="Specify the WebSocket subprotocol" value={subprotocol} onInput={(ev) => { setSubprotocol((ev.target as any).value); } }></VSCodeTextField>}
        </div>
      )}
      {!connected && showSubprotocol && (
        <MessageBar>
          <MessageBarBody>
            Make sure to configure <code>connect</code> event handler in your Web PubSub service to response accepted subprotocol if subprotocol is specified.
          </MessageBarBody>
        </MessageBar>
      )}


      {error && (
        <MessageBar intent="error" className="text-danger">
          {error}
        </MessageBar>
      )}

      {connected &&
      <>
        <VSCodeDivider />
        <ResizablePanel
          className="flex-fill"
          left={
            <VSCodePanels>
              <VSCodePanelTab id="tab-message"> Message </VSCodePanelTab>
              <VSCodePanelView id="view-message" className="d-flex flex-column overflow-auto flex-fill"> 
                {connectPane}
              </VSCodePanelView>
            </VSCodePanels>
          }
          right={
            <VSCodePanels>
              <VSCodePanelTab id="tab-history"> History </VSCodePanelTab>
              <VSCodePanelView id="view-history" className="d-flex flex-column overflow-auto flex-fill">
                {trafficPane}
              </VSCodePanelView>
            </VSCodePanels>
          }/>
        </>
        }
    </>
  );
};
