import React from "react";

import SplitDemo from "@site/src/components/DemoPage/SplitDemo";
import DemoTabs from "@site/src/components/DemoPage/DemoTabs";
import TextBlock from "@site/src/components/DemoPage/TextBlock";

import Local from "@site/src/components/DemoPage/Overview/Local";
import Deploy from "@site/src/components/DemoPage/Overview/Deploy";
import Resources from "@site/src/components/DemoPage/Overview/Resources";

import { DataDemos } from "../../../DataDemos";

const DataDemo = DataDemos.find(
  (item) => item.detailURL === "demos/realtime_scoreboard"
);

const languages = DataDemo.languages;
const githubURL = DataDemo.githubRepo;

function RealtimeScoreboard() {
  return (
    <>
      <SplitDemo
        leftSrc="https://awps-scoreboard-live-demo.azurewebsites.net/"
        rightSrc="https://awps-scoreboard-live-demo.azurewebsites.net/"
        description="Real-time chat app demo"
        width="400"
        languages={languages}
        githubURL={githubURL}
      />

      <div className="max-w-full overflow-hidden">
        <DemoTabs
          overview={<Overview />}
          local={<Local />}
          deploy={<Deploy />}
          resources={<Resources />}
        />
      </div>
    </>
  );
}

function Overview() {
  return (
    <div>
      <h2 className="text-4xl">Overview</h2>
      <TextBlock title="About the app">
        <p>
          The app a collabrative whiteboard by which multiple users can use an
          array of elements to collobrative.
        </p>
      </TextBlock>
      {/* <TextBlock title="Technologies and libraries used"></TextBlock> */}
      <TextBlock title="Azure Web PubSub enables">
        <ul className="ml-5 list-disc leading-5">
          <li className="mt-0">User presence status indicator</li>
          <li className="mt-0">Syncronization of user location</li>
          <li className="mt-0">Group text chatting</li>
        </ul>
      </TextBlock>

      <h2 className="mt-12 text-4xl">How it works?</h2>
      <TextBlock title="Server side">
        Serve a static web page <code>public/index.html</code> A REST API &nbsp;
        <code>/negotiate</code> which returns a url to connect to Web PubSub
        <ul className="ml-5 list-disc">
          <li className="mt-0">
            Serve a static web page <code>public/index.html</code>
          </li>
          <li className="mt-0">
            A REST API <code>/negotiate</code> which returns a url to connect to
            Web PubSub
          </li>
        </ul>
      </TextBlock>
      <TextBlock title="Client side">
        <p>
          The most logic of this app is happening at client side. In client
          there're two roles:
        </p>
        <ul className="ml-5 list-disc ">
          <li className="mt-0">
            <strong>Streamer</strong> <br></br>Streamer is the one who writes
            code and broadcasts to others. It uses <code>WebSocket.send()</code>{" "}
            to send the changes from the code editor (by hooking the
            editor.on('change') event) to a group (whose <code>ID</code> is
            generated in negotiate) in Azure Web PubSub. And for performance
            consideration, it buffers the changes and send them in a batch every
            200 milliseconds. The main implementation can be found at &nbsp;
            <code>startStream()</code> in <code>public/index.html</code>.
          </li>
          <li className="mt-0">
            <strong>Watcher</strong> <br></br>Watcher is the one who watches
          </li>
          <p>
            Watcher is the one who watches streamer to code. It receives the
            changes from Azure Web PubSub and applies them one by one to the
            code editor (by calling the applyDelta() function). Since the
            changes is only a delta from the previous content there needs to be
            a way to get the full content from streamer when watcher is
            connected for the first time. So in this app when watcher is
            connected it will send a sync message to streamer (through another
            group called <code>id-control</code>) and streamer will send the
            full content to the group. The main implementation can be found at
            &nbsp;
            <code>watch()</code> in <code>public/index.html</code>.
          </p>
        </ul>
      </TextBlock>
    </div>
  );
}

export default RealtimeScoreboard;
