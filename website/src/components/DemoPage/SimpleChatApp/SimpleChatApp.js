import React from 'react'

import SplitDemo from '@site/src/components/DemoPage/SplitDemo'
import DemoTabs from '@site/src/components/DemoPage/DemoTabs'
import TextBlock from '@site/src/components/DemoPage/TextBlock'

import Local from '@site/src/components/DemoPage/Overview/Local'
import Deploy from '@site/src/components/DemoPage/Overview/Deploy'
import Resources from '@site/src/components/DemoPage/Overview/Resources'

import { DataDemos } from '../../../DataDemos'

const DataDemo = DataDemos.find(item => item.detailURL === 'demos/chat')

const languages = DataDemo.languages
const githubURL = DataDemo.githubRepo

function SimpleChatApp() {
  return (
    <>
      <SplitDemo
        leftSrc="https://awps-demos-client-chat.azurewebsites.net/fancy.html"
        rightSrc="https://awps-demos-client-chat.azurewebsites.net/fancy.html"
        description="Real-time chat app demo"
        width="340"
        languages={languages}
        githubURL={githubURL}
      />

      <div className="max-w-full overflow-hidden">
        <DemoTabs overview={<Overview />} local={<Local />} resources={<Resources />} />
      </div>
    </>
  )
}

function Overview() {
  return (
    <div>
      <h2 className="text-4xl">Overview</h2>
      <TextBlock title="About the app">
        <p>A simple real-time chat app demonstrating the use of JavaScript server SDK provided by Azure Web PubSub</p>
      </TextBlock>
      {/* <TextBlock title="Technologies and libraries used"></TextBlock> */}
      <TextBlock title="Azure Web PubSub enables">
        <ul className="ml-5 list-disc leading-5">
          <li className="mt-0">Simple real-time chat between server and client</li>
        </ul>
      </TextBlock>

      <h2 className="mt-12 text-4xl">How it works?</h2>
      <TextBlock title="Server side">
        Serve a static web page <code>public/index.html</code> A REST API &nbsp;
        <code>/negotiate</code> which returns a url to connect to Web PubSub
        <ul className="ml-5 list-disc">
          <li className="mt-0">
            A simple Express server that serves a static web page <code>public/index.html</code>
          </li>
          <li className="mt-0">
            A REST API <code>/negotiate</code> which returns a url to connect to Web PubSub
          </li>
          <li className="mt-0">
            Listens for an <code>onConnected</code> event to broadcast the joining of chat participants.
          </li>
          <li className="mt-0">
            Listens for an <code>message</code> event to broadcast a use's chat message to all participants in a hub.
          </li>
        </ul>
      </TextBlock>
      <TextBlock title="Client side">
        <p>
          Using WebSocket API to initiate a WebSocket connection and listen for an <code>onmessage</code> event to render chat messages in the browser.
        </p>
      </TextBlock>
    </div>
  )
}

export default SimpleChatApp
