import React from 'react'

import SplitDemo from '@site/src/components/DemoPage/SplitDemo'
import DemoTabs from '@site/src/components/DemoPage/DemoTabs'
import TextBlock from '@site/src/components/DemoPage/TextBlock'
import HyperLink from '@site/src/components/Common/HyperLink'

import Local from '@site/src/components/DemoPage/Overview/Local'
import Deploy from '@site/src/components/DemoPage/Overview/Deploy'
import Resources from '@site/src/components/DemoPage/Overview/Resources'

import { DataDemos } from '../../../DataDemos'

const DataDemo = DataDemos.find(item => item.detailURL === 'demos/chatr')

const languages = DataDemo.languages
const githubURL = DataDemo.githubRepo

function Chatr() {
  return (
    <>
      <div className="max-w-full overflow-hidden">
        <DemoTabs overview={<Overview />} />
      </div>
    </>
  )
}

function Overview() {
  return (
    <div>
      <h1 className="text-4xl">Overview</h1>
      <TextBlock title="About the app">
        <p>
          This demo is developed by &nbsp;
          <HyperLink to="https://github.com/benc-uk" text="Ben Coleman" />
          using Azure Web PubSub service, Azure Static Web Apps, and deploy using Azure Bicep.
        </p>
      </TextBlock>
      <TextBlock title="Azure Web PubSub enables">
        <ul className="ml-5 list-disc leading-5">
          <li className="mt-0">Real-time code editing</li>
        </ul>
      </TextBlock>

      <h2 className="mt-12 text-4xl">Check out the live demo</h2>
      <p>
        You can check out the live demo &nbsp;
        <HyperLink to="https://github.com/benc-uk/chatr" />
      </p>
    </div>
  )
}

export default Chatr
