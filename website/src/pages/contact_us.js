import React from "react";
import Layout from "@theme/Layout";
import HyperLink from "@site/src/components/Common/HyperLink";

import GitHub from "@site/static/logos/github_logo.svg";

function ContactUs() {
  return (
    <Layout>
      <div className="flex justify-center px-6 font-sans">
        <div className=" max-w-3xl">
          <section className="mt-10">
            <h1 className="py-3 text-5xl font-bold">Where to Get Support?</h1>
            <p className="text-gray-800">
              Quis nostrum exercitationem ullam corporis suscipit laboriosam,
              nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure
              reprehenderit qui in ea voluptate velit esse quam nihil molestiae
              consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla
              pariatu{" "}
            </p>
          </section>

          <section>
            <h2 className="mt-10 py-1 text-3xl font-bold">Documentation</h2>
            <p className="text-gray-800">
              You can visit the documentation of Azure Web PubSub service
              from&nbsp;
              <HyperLink to="https://docs.microsoft.com/en-us/azure/azure-web-pubsub/overview" />
              .
            </p>
          </section>

          <section>
            <h2 className="mt-10 py-1 text-3xl font-bold">
              Reach out to the product team
            </h2>
            <h3 className="font-bold">
              Create a GitHub
              <GitHub className="icon_inline" />
              issue
            </h3>
            <p className="text-gray-800">
              The product team monitors GitHub issues on a daily basis. It’s the
              best way to reach out the team and ... Create a GitHub issue&nbsp;
              <HyperLink to="https://docs.microsoft.com/en-us/azure/azure-web-pubsub/overview" />
              .
            </p>
          </section>

          <section>
            <h2 className="mt-10 py-1 text-3xl font-bold">Suggest a demo</h2>
            <p className="text-gray-800">
              Have a demo you’d like to see on this site. Share your idea with
              us and creating a GitHub issue&nbsp;
              <HyperLink to="https://docs.microsoft.com/en-us/azure/azure-web-pubsub/overview" />
              .
            </p>
            <h3 className="pt-2 font-bold">
              Demos we are currently working on
            </h3>
            <ul className="list-inside list-disc">
              <li>Collaborative sales order processing app</li>
              <li>Truck tracking app</li>
            </ul>
          </section>
        </div>
      </div>
    </Layout>
  );
}

export default ContactUs;
