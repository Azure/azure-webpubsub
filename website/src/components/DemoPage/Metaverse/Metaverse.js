import React from 'react'

// import SplitDemo from "@site/src/components/DemoPage/SplitDemo";
import DemoTabs from '@site/src/components/DemoPage/DemoTabs'
import TextBlock from '@site/src/components/DemoPage/TextBlock'
import MetaverseScene from '@site/static/img/metaverse_scene.jpg'

import Image from '@site/src/components/Common/Image'

import Local from '@site/src/components/DemoPage/Overview/Local'
import Deploy from '@site/src/components/DemoPage/Overview/Deploy'
import Resources from '@site/src/components/DemoPage/Overview/Resources'

import { DataDemos } from '../../../DataDemos'

const DataDemo = DataDemos.find(item => item.detailURL === 'demos/metaverse')

const languages = DataDemo.languages
const githubURL = DataDemo.githubRepo

function Metaverse() {
  return (
    <>
      <Image imgURL={MetaverseScene} />
      <div className="max-w-full overflow-hidden">
        <DemoTabs overview={<Overview />} />
      </div>
    </>
  )
}

function Overview() {
  return (
    <div>
      <h2 className="text-4xl">Overview</h2>
      <TextBlock title="About the app">
        <p>An app demonstrating how Azure Web PubSub can be used to enable multi-player experience in Metaverse (coming soon)</p>
      </TextBlock>
      {/* <TextBlock title="Technologies and libraries used"></TextBlock> */}
      {/* <TextBlock title="Azure Web PubSub enables">
        <ul className="ml-5 list-disc leading-5">
          <li className="mt-0">User presence status indicator</li>
          <li className="mt-0">Syncronization of user location</li>
          <li className="mt-0">Group text chatting</li>
        </ul>
      </TextBlock> */}

      {/* <h2 className="mt-12 text-4xl">How it works?</h2>
      <TextBlock title="Server side">
        Serve a static web page <code>public/index.html</code> A REST API &nbsp;
        <code>/negotiate</code> which returns a url to connect to Web PubSub
        <ul className="ml-5 list-disc">
          <li className="mt-0">
            Serve a static web page <code>public/index.html</code>
          </li>
          <li className="mt-0">
            A REST API <code>/negotiate</code> which returns a url to connect to Web PubSub
          </li>
        </ul>
      </TextBlock> */}
    </div>
  )
}

export default Metaverse
