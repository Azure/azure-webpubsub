import * as React from 'react';
import { Pivot, PivotItem } from '@fluentui/react';


function DemoTabs({overview, local, deploy, resources}){
  const [selectedKey, setSelectedKey] = React.useState('overview');

  const handleLinkClick = (item?: PivotItem) => {
    if (item) {
      setSelectedKey(item.props.itemKey!);
    }
  };

  return (
    <div>
      <div className="w-full overflow-x-scroll overflow-y-hidden mb-8">
        <Pivot
          aria-label="Details about the demo"
          selectedKey={selectedKey}
          onLinkClick={handleLinkClick}
          headersOnly={true}
        >
          {overview && <PivotItem headerText="Overview" itemKey="overview" />}
          {local && <PivotItem headerText="Run locally" itemKey="local" />}
          {deploy && <PivotItem headerText="One-click deploy to Azure" itemKey="deploy" />}
          {resources && <PivotItem headerText="Resources" itemKey="resources" />}
        </Pivot>
      </div>
      <div className="font-sans font-light">
        {selectedKey === "overview" && overview}
        {selectedKey === "local" && local}
        {selectedKey === "deploy" && deploy}
        {selectedKey === "resources" && resources}
      </div>
    </div>
  );
};

export default DemoTabs;