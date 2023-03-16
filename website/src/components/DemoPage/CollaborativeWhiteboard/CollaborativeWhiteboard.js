import React from 'react'

import SplitDemo from '@site/src/components/DemoPage/SplitDemo'
import DemoTabs from '@site/src/components/DemoPage/DemoTabs'
import TextBlock from '@site/src/components/DemoPage/TextBlock'

import Local from '@site/src/components/DemoPage/Overview/Local'
import Deploy from '@site/src/components/DemoPage/Overview/Deploy'
import Resources from '@site/src/components/DemoPage/Overview/Resources'

import { DataDemos } from '../../../DataDemos'

const DataDemo = DataDemos.find(item => item.detailURL === 'demos/whiteboard')

const languages = DataDemo.languages
const githubURL = DataDemo.githubRepo
const onClickDeploy = DataDemo.deployLink

function CollaborativeWhiteboard() {
  return (
    <>
      <SplitDemo
        leftSrc="https://awps-demo-whiteboard.azurewebsites.net/"
        rightSrc="https://awps-demo-whiteboard.azurewebsites.net/"
        description="Real-time chat app demo"
        width="400"
        languages={languages}
        githubURL={githubURL}
      />

      <div className="max-w-full overflow-hidden">
        <DemoTabs overview={<Overview />} local={<Local />} resources={<Resources />} deploy={<Deploy to={onClickDeploy} />} />
      </div>
    </>
  )
}

function Overview() {
  return (
    <div>
      <h2 className="text-4xl">Overview</h2>
      <TextBlock title="About the app">
        <p>
          This is a sample project to demonstrate how to build a web application for real time collaboration using Azure, Node.js and other related
          technologies.
        </p>
      </TextBlock>
      {/* <TextBlock title="Technologies and libraries used"></TextBlock> */}
      <TextBlock title="Azure Web PubSub enables">
        <ul className="ml-5 list-disc leading-5">
          <li className="mt-0">A whiteboard that anyone can paint on and others can see each other painting in real time</li>
          <li className="mt-0">Real time chat</li>
        </ul>
      </TextBlock>

      <h2 className="mt-12 text-4xl">How it works?</h2>
      <TextBlock title="Frontend">
        <ul className="ml-5 list-disc">
          <li className="mt-0">HTML5/JavaScript</li>
          <li className="mt-0">Bootstrap</li>
          <li className="mt-0">Vue.js</li>
        </ul>
      </TextBlock>
      <TextBlock title="Backend">
        <ul className="ml-5 list-disc">
          <li className="mt-0">Node.js</li>
          <li className="mt-0">Express.js</li>
        </ul>
      </TextBlock>
      <TextBlock title="Real-time communication">
        <ul className="ml-5 list-disc">
          <li className="mt-0">Azure Web PubSub</li>
        </ul>
      </TextBlock>
    </div>
  )
}

export default CollaborativeWhiteboard
