import React from 'react'
import TextBlock from '@site/src/components/DemoPage/TextBlock'
import CodeBlock from '@site/src/components/DemoPage/CodeBlock'
import HyperLink from '@site/src/components/Common/HyperLink'

function Local() {
  return (
    <div>
      <h2 className="text-4xl">Prerequisites</h2>
      <TextBlock title="To run this app locally, you will need the following">
        <ul className="ml-5 list-disc ">
          <li className="mt-0">Node.js</li>
          <li className="mt-0">Create an Azure Web PubSub resource</li>
          <li className="mt-0">
            <code>Localtunnel</code> to expose our localhost to the internet
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

      <h2 className="mb-5 mt-10 text-4xl">Use Localtunnel to expose localhost</h2>
      <TextBlock>
        <p>
          <HyperLink to="https://github.com/localtunnel/localtunnel" text="Localtunnel" />
          is an open-source project that help expose your localhost to public.&nbsp;
          <HyperLink to="https://github.com/localtunnel/localtunnel#installation" text="Install" />
          the tool and run:
        </p>
      </TextBlock>
      <CodeBlock text="lt --port 8080 --print-requests" language="shell" />

      <h2 className="mb-5 mt-10 text-4xl">Configure the event handler</h2>
      <TextBlock>
        <p>
          Event handler can be set from Azure Portal or through Azure CLI.&nbsp;
          <HyperLink to="https://docs.microsoft.com/en-us/azure/azure-web-pubsub/howto-develop-eventhandler" text="Here" />
          contains the detailed instructions of how to set it up.
        </p>
      </TextBlock>
    </div>
  )
}

export default Local
