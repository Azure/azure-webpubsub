import React, { ReactNode, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import moment from "moment";
import { ReadonlyTabs } from "../components/Tabs";
import { ResizablePanel } from "../components/ResizablePanel";
import { useDataContext } from "../providers/DataContext";
import { HttpHistoryItem } from "../models";
import { Button } from "@fluentui/react-components";
import { bundleIcon, Delete24Filled, Delete24Regular } from "@fluentui/react-icons";
import ReactJson from "react-json-view";

import { Dialog, DialogTrigger, DialogSurface, DialogTitle, DialogBody, DialogActions, DialogContent } from "@fluentui/react-components";

const ClearHistoryIcon = bundleIcon(Delete24Filled, Delete24Regular);

export interface RequestHistoryProps {
  onUnreadChange: (unread: number) => void;
}

export function RequestHistory(props: RequestHistoryProps) {
  const [items, setItems] = useState<HttpHistoryItem[]>([]);
  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<HttpHistoryItem | undefined>(undefined);
  const [searchParams] = useSearchParams();
  const detailId = parseInt(searchParams.get("detailId") ?? "-1");
  const { data, dataFetcher } = useDataContext();

  useEffect(() => {
    setItems(data.trafficHistory);
    props.onUnreadChange(data.trafficHistory.filter((s) => s.unread).length);
  }, [props, data.trafficHistory]);
  useEffect(() => {
    if (selectedItem) {
      return;
    }
    if (detailId !== undefined && detailId >= 0) {
      var selected = items.find((s) => s.id === detailId);
      if (selected) {
        setSelectedItem(selected);
      }
    }
  }, [items, selectedItem, detailId]);

  function clearRequestHistory() {
    dataFetcher.invoke("clearTrafficHistory");
    setSelectedItem(undefined);
  }
  
  const overviewPanel = (
    <table className="table table-hover" aria-labelledby="tabelLabel">
      <thead>
        <tr>
          <th>Time</th>
          <th>Method</th>
          <th>URL</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr
            key={(item.id ?? 0) + (item.code ?? 0) * 1000}
            className={item.unread ? "unread" : item === selectedItem ? "active" : ""}
            onClick={() => {
              item.unread = false;
              props.onUnreadChange(data.trafficHistory.filter((s) => s.unread).length);
              setSelectedItem(item);
            }}
          >
            <td>{moment(item.requestAtOffset).fromNow()}</td>
            <td className={(item?.code ?? 500) < 300 ? "text-success" : "text-warning"}>
              <b>{item.methodName}</b>
            </td>
            <td>{item.url}</td>
            <td>{item.code ?? "(Waiting for response)"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const detailPanel = <Details item={selectedItem}></Details>;

  return (
    <div className="mx-4 d-flex flex-row server-container overflow-auto">
      <div className="table-container flex-fill d-flex flex-column">
        <div className="d-flex flex-row">
          <h5>All requests</h5>
          <div className="flex-fill"></div>
          <div className="flex-right">
            <Dialog open={openDialog} onOpenChange={(event, data) => setOpenDialog(data.open)}>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="subtle" size="large" icon={<ClearHistoryIcon />}>
                  Clear all requests
                </Button>
              </DialogTrigger>
              <DialogSurface>
                <DialogBody>
                  <DialogTitle>Clear the request history?</DialogTitle>
                  <DialogContent>Are you sure to clear the request history? It is unrecoverable.</DialogContent>
                  <DialogActions>
                    <DialogTrigger disableButtonEnhancement>
                      <Button appearance="secondary">Cancel</Button>
                    </DialogTrigger>
                    <Button
                      appearance="primary"
                      onClick={() => {
                        clearRequestHistory();
                        setOpenDialog(false);
                      }}
                    >
                      Yes
                    </Button>
                  </DialogActions>
                </DialogBody>
              </DialogSurface>
            </Dialog>
          </div>
        </div>
        {!data.ready ? (
          <p>
            <em>Loading...</em>
          </p>
        ) : (
          <ResizablePanel left={overviewPanel} right={detailPanel}></ResizablePanel>
        )}
      </div>
    </div>
  );
}

const renderContent = (message: { headers: Record<string, string>, content: string }): ReactNode => {
  if (message.headers["Content-Type"] === "application/json" || message.headers["Content-Type"] === "text/json") {
    try {
      const parsedJson = JSON.parse(message.content);
      return <div><ReactJson src={parsedJson} collapsed={1} /></div>;
    } catch (error) {
    }
  }
  return <div className="m-2" style={{ whiteSpace: "pre-wrap" }}>
    {message.content}
  </div>;
};

function revertRawTextToMessage(rawText: string): { headers: Record<string, string>, content: string } {
  const lines: string[] = rawText.split("\n").map(line => line.trim());
  const emptyIndex: number = lines.indexOf("");
  let headers: Record<string, string> = {};
  let content: string = "";
  for (let i: number = 0; i < emptyIndex; i++) {
    const splitIndex: number = lines[i].indexOf(":");
    if (splitIndex !== -1) {
      const key: string = lines[i].substring(0, splitIndex).trim();
      const value: string = lines[i].substring(splitIndex + 1).trim();
      headers[key] = value;
    }
  }
  if (emptyIndex !== -1) {
    content = lines.slice(emptyIndex + 1).join("\n").trim();
  }
  return { headers, content };
}

function Details({ item }: { item?: HttpHistoryItem }) {
  if (!item) return <></>;
  const requestMessage: { headers: Record<string, string>, content: string } = revertRawTextToMessage(item.requestRaw);
  const requestTabItems = [
    {
      title: "Formatted Request Details",
      content: (
        <div>
          <label style={{ fontWeight: "bold" }}>Header</label>
          <div className="m-2" style={{ whiteSpace: "pre-wrap" }}>
            {Object.entries(requestMessage.headers).map(([key, value], index) => (
              <div key={index}>
                {key}: {value}
              </div>
            ))}
          </div>
          <label style={{ fontWeight: "bold" }}>Content</label>
          {renderContent(requestMessage)}
        </div>
      ),
    },
    {
      title: "Raw Request Details",
      content: <div className="m-2" style={{ whiteSpace: "pre-wrap" }}>
        {item.requestRaw}
      </div>,
    },
  ];
  const responseMessage: {
    headers: Record<string, string>,
    content: string
  } = revertRawTextToMessage(item.responseRaw ? item.responseRaw : "");
  const responseTabItems = [
    {
      title: "Formatted Response Details",
      content: (
        <div>
          <label style={{ fontWeight: "bold" }}>Header</label>
          <div className="m-2" style={{ whiteSpace: "pre-wrap" }}>
            {Object.entries(responseMessage.headers).map(([key, value], index) => (
              <div key={index}>
                {key}: {value}
              </div>
            ))}
          </div>
          <label style={{ fontWeight: "bold" }}>Header</label>
          {item.responseRaw && renderContent(responseMessage)}
        </div>
      ),
    }, {
      title: "Raw Response Details",
      content: <div className="m-2" style={{ whiteSpace: "pre-wrap" }}>
        {item.responseRaw}
      </div>,
    },
  ];


  return (
    <div className="panel-container d-flex flex-column flex-fill">
      <div className="banner d-flex">
        <span>{moment(item.requestAtOffset).fromNow()}</span>
      </div>
      <div className="request">
        <h5>
          {item.methodName} {item.url}
        </h5>
        <ReadonlyTabs items={requestTabItems}></ReadonlyTabs>
      </div>
      <div className="response">
        <h5 className={(item?.code ?? 500) < 300 ? "text-success" : "text-warning"}>{item.code}</h5>
        <ReadonlyTabs items={responseTabItems}></ReadonlyTabs>
      </div>
    </div>
  );
}