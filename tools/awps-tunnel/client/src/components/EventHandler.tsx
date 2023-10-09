import { ServiceConfiguration } from "../models";
import { Skeleton, SkeletonItem } from "@fluentui/react-components";

import { InfoLabel } from "@fluentui/react-components/unstable";
import React from "react";

export function EventHandler(config: { hub: string; settings: ServiceConfiguration }): { title: React.ReactNode; content: React.ReactNode } {
  const title = (
    <InfoLabel
      info={
        <span>
          Configure the url template for {config.hub} to start with <code>tunnel:///</code>. Sample <code>az CLI</code> command:{" "}
          <code>
            az webpubsub hub create -n "{config.settings.resourceName}" -g "{config.settings.resourceGroup ?? "<yourResourceGroup>"}" --hub-name "{config.hub}" --event-handler
            url-template="tunnel:///eventhandler" user-event-pattern="*" system-event="connected" system-event="disconnected"
          </code>
        </span>
      }
    >
      <span>
        Event handler settings for hub <code>{config.hub}</code>
      </span>
    </InfoLabel>
  );
  const content = (
    <>
      {config.settings.loaded ? (
        <>
          {config.settings.message && <small className="text-warning">{config.settings.message}</small>}
          {config.settings.eventHandlers && config.settings.eventHandlers.length > 0 && (
            <>
              {!config.settings.eventHandlers.some((u) => u.urlTemplate.toLowerCase().startsWith("tunnel:///")) && (
                <small className="text-danger">
                  To use the tool, make sure the url template starts with <code>tunnel:///</code>
                </small>
              )}
              {/* <div className="d-flex flex-column justify-content-start">
              {config.settings.eventHandlers.map((s, i) => (
                <div key={i}>
                   <i>URL template: <code>{s.urlTemplate}</code>;system events:<code> {s.systemEvents.join(", ")}</code>; user event pattern: <code>{s.userEventPattern}</code></i>
                </div>
              ))}
            </div> */}
              <div className="d-flex justify-content-start">
                <div className="d-flex flex-column justify-content-start">
                  <small>
                    <b>URL template</b>
                  </small>
                  {config.settings.eventHandlers.map((s, i) => (
                    <code key={i}>
                      <small>{s.urlTemplate}</small>
                    </code>
                  ))}
                </div>
                <div className="d-flex mx-2 flex-column justify-content-start">
                  <small>
                    <b>System events</b>
                  </small>
                  {config.settings.eventHandlers.map((s, i) => (
                    <code key={i}>
                      <small> {s.systemEvents.join(", ")}</small>
                    </code>
                  ))}
                </div>
                <div className="d-flex flex-column justify-content-start">
                  <small>
                    <b>User event pattern</b>
                  </small>
                  {config.settings.eventHandlers.map((s, i) => (
                    <code key={i}>
                      <small>{s.userEventPattern}</small>
                    </code>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        // it is still loading
        <Skeleton>
          <div>
            <SkeletonItem shape="square" size={16} />
            <SkeletonItem size={16} />
          </div>
          <div>
            <SkeletonItem shape="square" size={16} />
          </div>
          <SkeletonItem size={16} />
        </Skeleton>
      )}
    </>
  );
  return { title, content };
}
