import React from "react";

import AzureLogo from "@site/static/logos/azure_icon_logo.svg";
import BladeOutputs from "@site/static/img/blade_outputs.jpg";

import ButtonLink from "@site/src/components/Common/ButtonLink";
import Image from "@site/src/components/Common/Image";
import TextBlock from "@site/src/components/DemoPage/TextBlock";

function Deploy() {
  return (
    <div>
      <h2 className="text-4xl">One-click deploy to Azure</h2>
      <TextBlock>
        <p>
          Deploy this demo app to Azure with one single click. Note that you
          will need an Azure account.
        </p>
      </TextBlock>
      <ButtonLink text="Deploy to Azure" to="#">
        <AzureLogo className="lightIcon" />
      </ButtonLink>

      <h2 className="mt-12 text-4xl">Visit your live demo</h2>
      <TextBlock>
        <p>
          Once the resources are provisioned, you can find <code>Outputs</code>{" "}
          on the side bar. Open the link in your browser.
        </p>
      </TextBlock>

      <Image imgURL={BladeOutputs} />
    </div>
  );
}

export default Deploy;
