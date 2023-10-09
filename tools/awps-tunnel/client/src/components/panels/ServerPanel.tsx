import { Icon } from "@fluentui/react/lib/Icon";
import { Switch, Field, ProgressBar } from "@fluentui/react-components";
import { useEffect, useState } from "react";

import { ConnectionStatus } from "../../models";
import CodeTabs from "../CodeTabs";
export interface ServerPanelProps {
  endpoint?: string;
  onChange: (checked: boolean) => Promise<{ success: boolean; message: string }>;
}
const key = "server-state";
function loadState(): {started: boolean} {
  const state = localStorage.getItem(key);
  if (state) {
    return JSON.parse(state);
  }
  return {started: false};
}

function setState(state: {started: boolean}): void {
  localStorage.setItem(key, JSON.stringify(state));
}

export function ServerPanel({ endpoint, onChange }: ServerPanelProps) {
  const [message, setMessage] = useState<string>();
  const [startEmbeddedServer, setStartEmbeddedServer] = useState<boolean>(false);
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.None);
  useEffect(() => {
    // loading the initial status from local storage
    const state = loadState();
    setStartEmbeddedServer(state.started);
  }, []);

  useEffect(() => {
    setState({started: startEmbeddedServer});
  }, [startEmbeddedServer]);

  function onSwitch(checked: boolean) {
    async function onSwitchAsync() {
      if (checked) {
        setStatus(ConnectionStatus.Connecting);
        setMessage("");
        try {
          const result = await onChange(true);
          // only set status when it succeeds
          setStartEmbeddedServer(result.success);
          setMessage(result.message);
          setStatus(ConnectionStatus.Connected);
        } catch (err) {
          setMessage(err?.toString() ?? "");
          setStatus(ConnectionStatus.None);
        }
      } else {
        setStatus(ConnectionStatus.Disconnecting);
        try {
          const result = await onChange(false);
          // only set status when it succeeds
          setStartEmbeddedServer(!result.success);
          setStatus(ConnectionStatus.Disconnected);
          setMessage(result.message);
        } catch (err) {
          setMessage(err?.toString() ?? "");
          setStatus(ConnectionStatus.None);
        }
      }
    }
    onSwitchAsync();
  }

  return (
    <div className="m-2">
      <p>
        <Icon className="mx-2" iconName="ServerEnviroment"></Icon>
        <b>
          Requests are sending to
          {startEmbeddedServer ? " built-in Echo Server." : ` your local server: ${endpoint}`}
        </b>
      </p>
      <Switch
        label={startEmbeddedServer ? "Built-in Echo Server started" : "Built-in Echo Server stopped"}
        checked={startEmbeddedServer}
        disabled={status === ConnectionStatus.Connecting || status === ConnectionStatus.Disconnecting}
        onChange={(ev) => onSwitch(ev.currentTarget.checked)}
      ></Switch>
      {(status === ConnectionStatus.Connecting || status === ConnectionStatus.Disconnecting) && (
        <Field className="m-2" validationMessage={status === ConnectionStatus.Connecting ? "Starting built-in Echo Server" : "Stopping built-in Echo Server"} validationState="none">
          <ProgressBar />
        </Field>
      )}
      <div className="m-2">
        <b>{message}</b>
        <hr></hr>
        <b>📋Sample code handling events in your app server:</b>
        <CodeTabs></CodeTabs>
      </div>
    </div>
  );
}
