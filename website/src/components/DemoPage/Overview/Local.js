import React from 'react'
import TextBlock from '@site/src/components/DemoPage/TextBlock'
import CodeBlock from '@site/src/components/DemoPage/CodeBlock'
import HyperLink from '@site/src/components/Common/HyperLink'

function Local({hub}) {
  return (
    <div>
      <h1>Local development instruction</h1>
      <h2 className="text-4xl">Prerequisites</h2>
      <TextBlock title="To run this app locally, you will need the following">
        <ul className="ml-5 list-disc ">
          <li className="mt-0">Node.js</li>
          <li className="mt-0">Create an Azure Web PubSub resource</li>
          <li className="mt-0">
          <HyperLink to="https://learn.microsoft.com/azure/azure-web-pubsub/howto-web-pubsub-tunnel-tool" text="awps-tunnel" /> to tunnel traffic from Web PubSub to your localhost
          </li>
        </ul>
      </TextBlock>

      <h2 className="mb-5 mt-10 text-4xl">Install dependencies</h2>
      <CodeBlock text="npm install" language="shell" />

      <h2 className="mb-5 mt-10 text-4xl">Start the app</h2>
      <CodeBlock
        text={`export WebPubSubConnectionString="<connection_string>"
  node server`}
        language="javascript"
        title="Linux"
      />
      <CodeBlock
        text={`set WebPubSubConnectionString="<connection_string>"
  node server`}
        language="javascript"
        title="Windows"
      />
    {hub &&
      (<><h2 className="mb-5 mt-10 text-4xl">Use <code>awps-tunnel</code> to tunnel traffic from Web PubSub service to localhost</h2>
      <TextBlock>
        <p>
          Install and run <HyperLink to="https://learn.microsoft.com/azure/azure-web-pubsub/howto-web-pubsub-tunnel-tool" text="awps-tunnel" />:
        </p>
      </TextBlock>
      <CodeBlock text={`awps-tunnel run --hub ${hub} --upstream http://localhost:8080`} language="shell" />

      <h2 className="mb-5 mt-10 text-4xl">Configure the event handler</h2>
      <TextBlock>
        <p>
          Event handler can be set from Azure Portal or through Azure CLI.&nbsp;
          <HyperLink to="https://docs.microsoft.com/en-us/azure/azure-web-pubsub/howto-develop-eventhandler" text="Here" />
          contains the detailed instructions of how to set it up.
        </p>
      </TextBlock></>)}
    </div>
  )
}

export default Local
