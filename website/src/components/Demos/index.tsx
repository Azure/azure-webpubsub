import React from 'react'
import { Stack, MessageBar, MessageBarType, MessageBarButton, Checkbox } from '@fluentui/react'

import DemoCard from '../DemoCard'
import * as styles from './styles.module'

export default function Demos(): JSX.Element {
  return (
    <div>
      <MessageBar
        messageBarType={MessageBarType.info}
        actions={<MessageBarButton>Tell us</MessageBarButton>}
        isMultiline={false}
        dismissButtonAriaLabel="Close"
        onDismiss={() => {}}
      >
        If you did not find the demos below, you can tell us what demo you need here
      </MessageBar>

      <Stack horizontal tokens={styles.checkboxTokens}>
        <Checkbox label="All" defaultChecked></Checkbox>
        <Checkbox label="Game" defaultChecked></Checkbox>
        <Checkbox label="Live chat" defaultChecked></Checkbox>
        <Checkbox label="Geolocation" defaultChecked></Checkbox>
        <Checkbox label="Collaboration" defaultChecked></Checkbox>
      </Stack>

      <Stack wrap horizontal horizontalAlign="start" tokens={styles.demoCardTokens}>
        <DemoCard></DemoCard>
        <DemoCard></DemoCard>
        <DemoCard></DemoCard>
        <DemoCard></DemoCard>
        <DemoCard></DemoCard>
        <DemoCard></DemoCard>
        <DemoCard></DemoCard>
        <DemoCard></DemoCard>
        <DemoCard></DemoCard>
      </Stack>
    </div>
  )
}
