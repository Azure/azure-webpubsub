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
      <Image imgURL={MetaverseScene} ariaInfo="metaverse scene image" alt="metaverse scene image" />
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
    </div>
  )
}

export default Metaverse
