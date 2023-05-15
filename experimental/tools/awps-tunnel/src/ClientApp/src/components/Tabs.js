import React, { useState } from 'react';
import { TabContent, TabPane, Nav, NavItem, NavLink } from 'reactstrap';

export function ReadonlyTabs({ items, activeIndex }) {
  const [activeTab, setActiveTab] = useState(activeIndex ?? 0);
  const onTabSwitch = (i) => setActiveTab(i);
  return Tabs({ items, activeTab, onTabSwitch });
}

export function Tabs({ items, activeTab, onTabSwitch, className }) {
  
  if (!items || items.length === 0)
    return <></>;

  return (
    <div className={ `${className}` }>
      <Nav tabs>
        {items.map((item, index) => (
          <NavItem key={index}>
            <NavLink href="#" className={activeTab === index ? 'active' : ''}
              onClick={() => onTabSwitch(index)}
            >
              {item.title}
            </NavLink>
          </NavItem>
        ))}
      </Nav>
      <TabContent activeTab={activeTab}>
        {items.map((item, index) => (
          <TabPane tabId={index} key={index}
            className={(activeTab === index ? 'active' : '') + ' ' + item.key + ' p-2' }
          >
            {item.content}
          </TabPane>
        ))}
      </TabContent>
    </div>);
}
