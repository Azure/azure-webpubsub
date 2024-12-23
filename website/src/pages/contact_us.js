import React from 'react'
import Layout from '@theme/Layout'
import HyperLink from '@site/src/components/Common/HyperLink'

import GitHub from '@site/static/logos/github_logo.svg'

function ContactUs() {
  return (
    <Layout>
      <div className="flex justify-center px-6 font-sans">
        <div className=" max-w-3xl">
          <section className="mt-10">
            <h1 className="py-3 text-5xl font-bold">Where to Get Support?</h1>
            <p className="text-gray-800">
              If you already have a Web PubSub resource created on Azure portal, you can create a support ticket. Alternatively, you can create an issue on the
              public GitHub issue. Our team monitors the issues very closely and tries to resolve the issue as soon as we can.
            </p>
          </section>

          <section>
            <h2 className="mt-10 py-1 text-3xl font-bold">Documentation</h2>
              <p className="text-gray-800">
                You can visit the{' '}
                <HyperLink
                  to="https://docs.microsoft.com/en-us/azure/azure-web-pubsub/overview"
                  text="Azure Web PubSub Documentation link"
                />.
              </p>
          </section>

          <section>
            <h2 className="mt-10 py-1 text-3xl font-bold">Reach out to the product team</h2>
            <h3 className="font-bold">
              Create a GitHub
              <GitHub className="icon_inline" />
              issue
            </h3>
            <p className="text-gray-800">
              The product team monitors GitHub issues on a daily basis. It’s the best way to reach out to the team and share your feedback. Create an issue on&nbsp;
              <HyperLink
                to="https://github.com/Azure/azure-webpubsub"
                text="the Azure Web PubSub GitHub Repository link"
              />.
            </p>
          </section>

          <section>
            <h2 className="mt-10 py-1 text-3xl font-bold">Suggest a demo</h2>
            <p className="text-gray-800">
              Have a demo you’d like to see on this site? Share your idea with us by creating an issue on&nbsp;
              <HyperLink
                to="https://github.com/Azure/azure-webpubsub"
                text="the Azure Web PubSub GitHub Repository link"
              />.
            </p>
            <h3 className="pt-2 font-bold">Demos we are currently working on</h3>
            <ul className="list-inside list-disc">
              <li>Collaborative sales order processing app</li>
              <li>Truck tracking app</li>
            </ul>
          </section>
        </div>
      </div>
    </Layout>
  )
}

export default ContactUs
