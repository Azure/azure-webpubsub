import React from 'react'

import SplitDemo from '@site/src/components/DemoPage/SplitDemo'
import DemoTabs from '@site/src/components/DemoPage/DemoTabs'
import TextBlock from '@site/src/components/DemoPage/TextBlock'

import Local from '@site/src/components/DemoPage/Overview/Local'
import Deploy from '@site/src/components/DemoPage/Overview/Deploy'
import Resources from '@site/src/components/DemoPage/Overview/Resources'

import { DataDemos } from '../../../DataDemos'

const DataDemo = DataDemos.find(item => item.detailURL === 'demos/scoreboard')

const languages = DataDemo.languages
const githubURL = DataDemo.githubRepo
const onClickDeploy = DataDemo.deployLink

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
        <DemoTabs overview={<Overview />} local={<Local hub={"sample_scoreboard"} />} deploy={<Deploy to={onClickDeploy} />} resources={<Resources />} />
      </div>
    </>
  )
}

function Overview() {
  return (
    <div>
      <h2 className="text-4xl">Overview</h2>
      <TextBlock title="About the app">
        <p>This app demonstrates how to push data from server to connected clients using Azure Web PubSub</p>
      </TextBlock>
      <TextBlock title="Azure Web PubSub enables">
        <ul className="ml-5 list-disc leading-5">
          <li className="mt-0">Server pushing data to clients in real-time</li>
        </ul>
      </TextBlock>
    </div>
  )
}

export default RealtimeScoreboard
